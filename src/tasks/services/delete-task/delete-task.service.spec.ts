import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

describe('DeleteTaskService', () => {
  let module: TestingModule;
  let service: DeleteTaskService;
  const removeTask = vi.fn<TaskRepository['delete']>();
  const findTask = vi.fn<FindTaskByUuidService['execute']>();

  beforeEach(async () => {
    removeTask.mockReset();
    findTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        DeleteTaskService,
        { provide: TaskRepository, useValue: { delete: removeTask } },
        { provide: FindTaskByUuidService, useValue: { execute: findTask } },
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

      const result = await service.execute('user-1', 'task-1');

      expect(result).toBeUndefined();
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

      const result = service.execute('user-1', 'task-1');

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

      await expect(service.execute('user-1', 'task-1')).rejects.toBe(error);
      expect(removeTask).not.toHaveBeenCalled();
    });

    it('hides unexpected lookup details without changing persistence', async () => {
      findTask.mockRejectedValue(new Error('private lookup details'));

      await expect(service.execute('user-1', 'task-1')).rejects.toThrow(
        new TaskException(),
      );
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

    await expect(service.execute('user-1', 'task-1')).rejects.toBe(error);
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

    await expect(service.execute('user-1', 'task-1')).rejects.toThrow(
      new TaskException(),
    );
  });
});
