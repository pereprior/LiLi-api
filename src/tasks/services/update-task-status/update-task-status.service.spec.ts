import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';

describe('UpdateTaskStatusService', () => {
  let module: TestingModule;
  let service: UpdateTaskStatusService;
  const update = vi.fn<TaskRepository['update']>();
  const findTask = vi.fn<FindTaskByUuidService['execute']>();

  beforeEach(async () => {
    update.mockReset();
    findTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        UpdateTaskStatusService,
        { provide: TaskRepository, useValue: { update } },
        { provide: FindTaskByUuidService, useValue: { execute: findTask } },
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
      expect(findTask).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        {
          uuid: 'task-1',
        },
      );
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
});
