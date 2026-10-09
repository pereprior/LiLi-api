import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

describe('FindTaskByUuidService', () => {
  let module: TestingModule;
  let service: FindTaskByUuidService;
  const findByUuid = vi.fn<TaskRepository['findByUuid']>();

  beforeEach(async () => {
    findByUuid.mockReset();
    module = await Test.createTestingModule({
      providers: [
        FindTaskByUuidService,
        { provide: TaskRepository, useValue: { findByUuid } },
      ],
    }).compile();
    service = module.get(FindTaskByUuidService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Visible tasks', () => {
    it("looks up the requested UUID within the acting user's tasks", async () => {
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
      findByUuid.mockResolvedValue(task);

      await service.execute('user-1', 'task-1');

      expect(findByUuid).toHaveBeenCalledExactlyOnceWith('user-1', 'task-1');
    });

    it.each([
      'PENDING',
      'SCHEDULED',
      'IN_PROGRESS',
      'PAUSED',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED',
    ] as const)(
      'returns a visible %s task without imposing creation restrictions',
      async (status) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Groceries',
          null,
          status,
          null,
          null,
          null,
          null,
        );
        findByUuid.mockResolvedValue(task);

        const found = await service.execute('user-1', 'task-1');

        expect(found).toBe(task);
      },
    );

    it('returns the requested subtask without querying its principal', async () => {
      const subtask = new TaskEntity(
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
      findByUuid.mockResolvedValue(subtask);

      const found = await service.execute('user-1', subtask.uuid);

      expect(found).toBe(subtask);
      expect(findByUuid).toHaveBeenCalledExactlyOnceWith(
        'user-1',
        subtask.uuid,
      );
    });
  });

  describe('Hidden or missing tasks', () => {
    it('reports not found when the repository returns no visible task', async () => {
      findByUuid.mockResolvedValue(null);

      await expect(service.execute('user-1', 'task-1')).rejects.toThrow(
        new TaskNotFoundException(),
      );
    });
  });

  describe('Persistence failures', () => {
    it('preserves a domain error raised by persistence', async () => {
      const error = new TaskNotFoundException();
      findByUuid.mockRejectedValue(error);

      await expect(service.execute('user-1', 'task-1')).rejects.toBe(error);
    });

    it('hides unexpected lookup details', async () => {
      findByUuid.mockRejectedValue(new Error('private database details'));

      await expect(service.execute('user-1', 'task-1')).rejects.toThrow(
        new TaskException(),
      );
    });
  });
});
