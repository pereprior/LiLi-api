import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';

describe('UpdateTaskStatusService', () => {
  let module: TestingModule;
  let service: UpdateTaskStatusService;
  const update = vi.fn<TaskRepository['update']>();
  const findTask = vi.fn<TaskRepository['findByUuid']>();
  const findSubtasks = vi.fn<TaskRepository['findSubtasks']>();

  beforeEach(async () => {
    update.mockReset();
    findSubtasks.mockReset();
    findSubtasks.mockResolvedValue([]);
    findTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        UpdateTaskStatusService,
        {
          provide: TaskRepository,
          useValue: {
            findByUuid: findTask,
            update,
            findSubtasks,
            transaction: <T>(
              operation: (repository: TaskRepository) => Promise<T>,
            ): Promise<T> => operation(module.get(TaskRepository)),
          },
        },
      ],
    }).compile();
    service = module.get(UpdateTaskStatusService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Visible tasks', () => {
    it('applies the operation to the acting user task', async () => {
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

      const result = await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        {
          status: 'IN_PROGRESS',
        },
      );

      expect(result).toBe(task);
      expect(findTask).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        status: 'IN_PROGRESS',
      });
    });

    it('waits for the visible task lookup before changing persistence', async () => {
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
      const lookup = Promise.withResolvers<TaskEntity>();
      findTask.mockReturnValue(lookup.promise);
      update.mockResolvedValue(task);

      const result = service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        {
          status: 'IN_PROGRESS',
        },
      );

      expect(update).not.toHaveBeenCalled();
      lookup.resolve(task);
      await result;
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lookup failures', () => {
    it('preserves a not found error without changing persistence', async () => {
      const error = new TaskNotFoundException();
      findTask.mockRejectedValue(error);

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { status: 'IN_PROGRESS' },
        ),
      ).rejects.toBe(error);
      expect(update).not.toHaveBeenCalled();
    });

    it('hides unexpected lookup details without changing persistence', async () => {
      findTask.mockRejectedValue(new Error('private lookup details'));

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { status: 'IN_PROGRESS' },
        ),
      ).rejects.toThrow(new TaskException());
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('Status values', () => {
    it.each([
      'PENDING',
      'SCHEDULED',
      'IN_PROGRESS',
      'PAUSED',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED',
    ] as const)(
      'passes %s to persistence without changing other fields',
      async (status) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Groceries',
          null,
          status === 'IN_PROGRESS' ? 'PENDING' : 'IN_PROGRESS',
          new TaskDateEntity('2026-10-10'),
          null,
          null,
          null,
        );
        findTask.mockResolvedValue(task);
        update.mockResolvedValue(task);

        await service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { status },
        );

        expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
          status,
        });
      },
    );
  });

  it('preserves domain errors', async () => {
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
    const error = new TaskNotFoundException();
    update.mockRejectedValue(error);

    await expect(
      service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'IN_PROGRESS' },
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
    const error = new Error('private database details');
    update.mockRejectedValue(error);

    await expect(
      service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'IN_PROGRESS' },
      ),
    ).rejects.toThrow(new TaskException());
  });

  describe('State and hierarchy rules', () => {
    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'rejects moving a %s task to another state',
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
          { status: 'IN_PROGRESS' },
        );

        await expect(result).rejects.toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks are immutable.',
          ),
        );
        expect(update).not.toHaveBeenCalled();
      },
    );

    it.each(['PENDING', 'COMPLETED', 'CANCELLED'] as const)(
      'leaves an unchanged %s state untouched',
      async (status) => {
        const task = new TaskEntity(
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
        );
        findTask.mockResolvedValue(task);

        const result = await service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { status },
        );

        expect(result).toBe(task);
        expect(update).not.toHaveBeenCalled();
      },
    );

    it('requires a start before scheduling a task', async () => {
      findTask.mockResolvedValue(
        new TaskEntity(
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
        ),
      );

      const result = service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'SCHEDULED' },
      );

      await expect(result).rejects.toThrow(
        new TaskValidationException('Scheduled tasks require a start date.'),
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects advancing a subtask under a pending principal', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        'parent-1',
        'Groceries',
        null,
        'PENDING',
        null,
        null,
        null,
        null,
      );
      const parent = new TaskEntity(
        'parent-1',
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
      findTask.mockResolvedValueOnce(task).mockResolvedValueOnce(parent);

      const result = service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'IN_PROGRESS' },
      );

      await expect(result).rejects.toThrow(
        new TaskConflictException(
          'Subtask status IN_PROGRESS is incompatible with principal status PENDING.',
        ),
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('allows scheduling a dated subtask under a scheduled principal', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        'parent-1',
        'Groceries',
        null,
        'PENDING',
        new TaskDateEntity('2026-10-10'),
        null,
        null,
        null,
      );
      const parent = new TaskEntity(
        'parent-1',
        'user-1',
        null,
        'Dinner',
        null,
        'SCHEDULED',
        new TaskDateEntity('2026-10-10'),
        null,
        null,
        null,
      );
      findTask.mockResolvedValueOnce(task).mockResolvedValueOnce(parent);
      update.mockResolvedValue({ ...task, status: 'SCHEDULED' });

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'SCHEDULED' },
      );

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        status: 'SCHEDULED',
      });
    });

    it.each(['PENDING', 'SCHEDULED', 'COMPLETED'] as const)(
      'rejects a principal transition to %s with an active subtask',
      async (status) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Dinner',
          null,
          'IN_PROGRESS',
          new TaskDateEntity('2026-10-10'),
          null,
          null,
          null,
        );
        findTask.mockResolvedValue(task);
        findSubtasks.mockResolvedValue([
          new TaskEntity(
            'child-1',
            'user-1',
            'task-1',
            'Groceries',
            null,
            'IN_PROGRESS',
            null,
            null,
            null,
            null,
          ),
        ]);

        const result = service.execute(
          { uuid: 'user-1' },
          { uuid: 'task-1' },
          { status },
        );

        await expect(result).rejects.toBeInstanceOf(TaskConflictException);
        expect(update).not.toHaveBeenCalled();
      },
    );

    it('completes a principal whose subtasks are completed or cancelled', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Dinner',
        null,
        'IN_PROGRESS',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      findSubtasks.mockResolvedValue([
        new TaskEntity(
          'completed-1',
          'user-1',
          'task-1',
          'Groceries',
          null,
          'COMPLETED',
          null,
          null,
          null,
          null,
        ),
        new TaskEntity(
          'cancelled-1',
          'user-1',
          'task-1',
          'Dessert',
          null,
          'CANCELLED',
          null,
          null,
          null,
          null,
        ),
      ]);
      update.mockResolvedValue({ ...task, status: 'COMPLETED' });

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'COMPLETED' },
      );

      expect(update).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1', {
        status: 'COMPLETED',
      });
    });

    it('cancels active subtasks together with their principal', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Dinner',
        null,
        'IN_PROGRESS',
        null,
        null,
        null,
        null,
      );
      findTask.mockResolvedValue(task);
      findSubtasks.mockResolvedValue([
        new TaskEntity(
          'pending-1',
          'user-1',
          'task-1',
          'Groceries',
          null,
          'PENDING',
          null,
          null,
          null,
          null,
        ),
        new TaskEntity(
          'cancelled-1',
          'user-1',
          'task-1',
          'Dessert',
          null,
          'CANCELLED',
          null,
          null,
          null,
          null,
        ),
      ]);
      update.mockResolvedValue({ ...task, status: 'CANCELLED' });

      await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'CANCELLED' },
      );

      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenNthCalledWith(1, 'user-1', 'pending-1', {
        status: 'CANCELLED',
      });
      expect(update).toHaveBeenNthCalledWith(2, 'user-1', 'task-1', {
        status: 'CANCELLED',
      });
    });

    it('rejects cancellation when a visible subtask is completed', async () => {
      findTask.mockResolvedValue(
        new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Dinner',
          null,
          'IN_PROGRESS',
          null,
          null,
          null,
          null,
        ),
      );
      findSubtasks.mockResolvedValue([
        new TaskEntity(
          'child-1',
          'user-1',
          'task-1',
          'Groceries',
          null,
          'COMPLETED',
          null,
          null,
          null,
          null,
        ),
      ]);

      const result = service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        { status: 'CANCELLED' },
      );

      await expect(result).rejects.toThrow(
        new TaskConflictException(
          'Tasks with completed subtasks cannot be cancelled.',
        ),
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
          { status: 'IN_PROGRESS' },
        ),
      ).rejects.toThrow(new TaskNotFoundException());

      expect(update).not.toHaveBeenCalled();
    });
  });
});
