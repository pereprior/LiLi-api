import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';

describe('FindAllTasksService', () => {
  let module: TestingModule;
  let service: FindAllTasksService;
  const findAll = vi.fn<TaskRepository['findAll']>();

  beforeEach(async () => {
    findAll.mockReset();
    module = await Test.createTestingModule({
      providers: [
        FindAllTasksService,
        { provide: TaskRepository, useValue: { findAll } },
      ],
    }).compile();
    service = module.get(FindAllTasksService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Visible tasks', () => {
    it('returns the acting user tasks in repository order', async () => {
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
      const tasks = [task];
      findAll.mockResolvedValue(tasks);

      const result = await service.execute({ uuid: 'user-1' });

      expect(result).toBe(tasks);
      expect(findAll).toHaveBeenCalledExactlyOnceWith('user-1');
    });

    it('returns an empty list when no tasks are visible', async () => {
      findAll.mockResolvedValue([]);

      expect(await service.execute({ uuid: 'user-1' })).toEqual([]);
    });
  });

  it('preserves domain errors', async () => {
    const error = new TaskNotFoundException();
    findAll.mockRejectedValue(error);

    await expect(service.execute({ uuid: 'user-1' })).rejects.toBe(error);
  });

  it('hides unexpected persistence details', async () => {
    const error = new Error('private database details');
    findAll.mockRejectedValue(error);

    await expect(service.execute({ uuid: 'user-1' })).rejects.toThrow(
      new TaskException(),
    );
  });
});
