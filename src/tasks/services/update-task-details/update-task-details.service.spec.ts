import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';

describe('UpdateTaskDetailsService', () => {
  let module: TestingModule;
  let service: UpdateTaskDetailsService;
  const update = vi.fn<TaskRepository['update']>();
  const findTask = vi.fn<TaskRepository['findByUuid']>();

  beforeEach(async () => {
    update.mockReset();
    findTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        UpdateTaskDetailsService,
        {
          provide: TaskRepository,
          useValue: {
            findByUuid: findTask,
            update,
            transaction: <T>(
              operation: (repository: TaskRepository) => Promise<T>,
            ): Promise<T> => operation(module.get(TaskRepository)),
          },
        },
      ],
    }).compile();
    service = module.get(UpdateTaskDetailsService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Partial updates', () => {
    it('trims the supplied name without sending omitted fields', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        'Weekly',
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(task);

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { name: '  Dinner  ' },
      );

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        name: 'Dinner',
      });
      expect(findTask).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
    });

    it('returns the persisted task', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      const updated = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Dinner',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(updated);

      expect(
        await service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Dinner' },
        ),
      ).toBe(updated);
    });

    it('converts supplied dates and preserves explicit midnight', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(task);

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        {
          description: 'Weekly',
          start: '2026-10-10',
          end: '2026-10-10T00:00',
          reminder: '2026-10-09T18:00',
        },
      );

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        description: 'Weekly',
        start: new TaskDateEntity('2026-10-10', null),
        end: new TaskDateEntity('2026-10-10', '00:00'),
        reminder: new TaskDateEntity('2026-10-09', '18:00'),
      });
    });

    it('clears nullable fields when explicitly supplied as null', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        'Weekly',
        'PENDING',
        new TaskDateEntity('2026-10-10', null),
        new TaskDateEntity('2026-10-11', null),
        new TaskDateEntity('2026-10-09', '18:00'),
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(task);

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        {
          description: null,
          start: null,
          end: null,
          reminder: null,
        },
      );

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        description: null,
        start: null,
        end: null,
        reminder: null,
      });
    });

    it('does not clear fields for an empty update', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(task);

      await service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }, {});

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {});
    });
  });

  describe('Date range validation', () => {
    it.each([
      {
        label: 'an end before the stored start',
        start: new TaskDateEntity('2026-10-10', null),
        end: null,
        dto: { end: '2026-10-09' },
      },
      {
        label: 'a start after the stored end',
        start: null,
        end: new TaskDateEntity('2026-10-10', null),
        dto: { start: '2026-10-11' },
      },
      {
        label: 'an earlier time on the same day',
        start: new TaskDateEntity('2026-10-10', '12:00'),
        end: null,
        dto: { end: '2026-10-10T11:00' },
      },
      {
        label: 'an invalid range in the same update',
        start: null,
        end: null,
        dto: { start: '2026-10-11', end: '2026-10-10' },
      },
    ])(
      'rejects $label without persisting changes',
      async ({ start, end, dto }) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Groceries',
          null,
          'PENDING',
          start,
          end,
          null,
          null,
        );
        findTask.mockResolvedValue(task);

        await expect(
          service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }, dto),
        ).rejects.toThrow(
          new TaskValidationException('Task end cannot precede its start.'),
        );
        expect(update).not.toHaveBeenCalled();
      },
    );

    it.each([
      { start: '2026-10-10', end: '2026-10-10T00:00' },
      { start: '2026-10-10T12:00', end: '2026-10-10' },
      { start: '2026-10-10T12:00', end: '2026-10-10T12:00' },
      { start: '2026-10-10T12:00', end: '2026-10-10T13:00' },
      { start: '2026-10-10', end: '2026-10-11' },
    ])('accepts a range from $start to $end', async (dto) => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockResolvedValue(task);

      await service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }, dto);

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        start: new TaskDateEntity(
          dto.start.slice(0, 10),
          dto.start.includes('T') ? dto.start.slice(11) : null,
        ),
        end: new TaskDateEntity(
          dto.end.slice(0, 10),
          dto.end.includes('T') ? dto.end.slice(11) : null,
        ),
      });
    });
  });

  describe('Failures', () => {
    it('preserves a lookup domain error without updating', async () => {
      const error = new TaskNotFoundException();
      findTask.mockRejectedValue(error);

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Dinner' },
        ),
      ).rejects.toBe(error);
      expect(update).not.toHaveBeenCalled();
    });

    it('hides unexpected lookup details without updating', async () => {
      findTask.mockRejectedValue(new Error('private lookup details'));

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Dinner' },
        ),
      ).rejects.toThrow(new TaskException());
      expect(update).not.toHaveBeenCalled();
    });

    it('preserves domain errors from persistence', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      const error = new TaskValidationException('Invalid local time.');
      update.mockRejectedValue(error);

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Dinner' },
        ),
      ).rejects.toBe(error);
    });

    it('hides unexpected persistence details', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      update.mockRejectedValue(new Error('private database details'));

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Dinner' },
        ),
      ).rejects.toThrow(new TaskException());
    });
  });

  describe('State restrictions', () => {
    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'rejects detail edits on a %s task',
      async (status) => {
        findTask.mockResolvedValue(
          new TaskEntity(
            'task-1',
            'user-1',
            null,
            'Dinner',
            null,
            status,
            null,
            null,
            null,
            null,
          ),
        );

        const result = service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Changed' },
        );

        await expect(result).rejects.toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks are immutable.',
          ),
        );
        expect(update).not.toHaveBeenCalled();
      },
    );

    it('rejects clearing the start of a scheduled task', async () => {
      findTask.mockResolvedValue(
        new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Dinner',
          null,
          'SCHEDULED',
          new TaskDateEntity('2026-10-10'),
          null,
          null,
          null,
        ),
      );

      const result = service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { start: null },
      );

      await expect(result).rejects.toThrow(
        new TaskValidationException('Scheduled tasks require a start date.'),
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('Missing records', () => {
    it('rejects a missing task without modifying persistence', async () => {
      findTask.mockResolvedValue(null);

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { name: 'Groceries' },
        ),
      ).rejects.toThrow(new TaskNotFoundException());

      expect(update).not.toHaveBeenCalled();
    });
  });
});
