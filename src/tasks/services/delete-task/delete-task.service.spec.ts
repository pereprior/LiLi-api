import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';

describe('DeleteTaskService', () => {
  let module: TestingModule;
  let service: DeleteTaskService;
  const removeTask = vi.fn<TaskRepository['delete']>();
  const findTask = vi.fn<TaskRepository['findByUuid']>();
  const softDelete = vi.fn<TaskRepository['softDelete']>();

  beforeEach(async () => {
    removeTask.mockReset();
    softDelete.mockReset();
    findTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        DeleteTaskService,
        {
          provide: TaskRepository,
          useValue: {
            findByUuid: findTask,
            delete: removeTask,
            softDelete,
            transaction: <T>(
              operation: (repository: TaskRepository) => Promise<T>,
            ): Promise<T> => operation(module.get(TaskRepository)),
          },
        },
      ],
    }).compile();
    service = module.get(DeleteTaskService);
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
      removeTask.mockResolvedValue(undefined);

      const result = await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
      );

      expect(result).toEqual({ success: true });
      expect(findTask).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
      expect(removeTask).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
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
      removeTask.mockResolvedValue(undefined);

      const result = service.execute({ uuid: 'user-1' }, { uuid: 'task-1' });

      expect(removeTask).not.toHaveBeenCalled();
      lookup.resolve(task);
      await result;
      expect(removeTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lookup failures', () => {
    it('preserves a not found error without changing persistence', async () => {
      const error = new TaskNotFoundException();
      findTask.mockRejectedValue(error);

      await expect(
        service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }),
      ).rejects.toBe(error);
      expect(removeTask).not.toHaveBeenCalled();
    });

    it('hides unexpected lookup details without changing persistence', async () => {
      findTask.mockRejectedValue(new Error('private lookup details'));

      await expect(
        service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }),
      ).rejects.toThrow(new TaskException());
      expect(removeTask).not.toHaveBeenCalled();
    });
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
    removeTask.mockRejectedValue(error);

    await expect(
      service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }),
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
    removeTask.mockRejectedValue(error);

    await expect(
      service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }),
    ).rejects.toThrow(new TaskException());
  });

  describe('Deletion mode', () => {
    it.each([
      'SCHEDULED',
      'IN_PROGRESS',
      'PAUSED',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED',
    ] as const)('soft-deletes a %s task', async (status) => {
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
      softDelete.mockResolvedValue(undefined);

      const result = await service.execute(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
      );

      expect(result).toEqual({ success: true });
      expect(softDelete).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
      expect(removeTask).not.toHaveBeenCalled();
    });
  });

  describe('Missing records', () => {
    it('rejects a missing task without modifying persistence', async () => {
      findTask.mockResolvedValue(null);

      await expect(
        service.execute({ uuid: 'user-1' }, { uuid: 'task-1' }),
      ).rejects.toThrow(new TaskNotFoundException());

      expect(removeTask).not.toHaveBeenCalled();
      expect(softDelete).not.toHaveBeenCalled();
    });
  });
});
