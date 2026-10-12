import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskActions } from '#src/actions/modules/tasks/task-actions.js';
import { DeleteResponse } from '#src/shared/responses/delete.response.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('TaskActions', () => {
  let module: TestingModule;
  let actions: TaskActions;
  const task = new TaskEntity(
    'task-1',
    'owner-1',
    null,
    'Groceries',
    null,
    TaskStatus.PENDING,
    TaskPriority.MEDIUM,
    null,
    null,
    null,
    new Date('2026-10-12T10:00:00Z'),
  );
  const createTask = vi.fn<CreateTaskService['execute']>();
  const findAllTasks = vi.fn<FindAllTasksService['execute']>();
  const findTaskByUuid = vi.fn<FindTaskByUuidService['execute']>();
  const updateTaskDetails = vi.fn<UpdateTaskDetailsService['execute']>();
  const updateTaskStatus = vi.fn<UpdateTaskStatusService['execute']>();
  const deleteTask = vi.fn<DeleteTaskService['execute']>();

  beforeEach(async () => {
    createTask.mockReset();
    findAllTasks.mockReset();
    findTaskByUuid.mockReset();
    updateTaskDetails.mockReset();
    updateTaskStatus.mockReset();
    deleteTask.mockReset();
    module = await Test.createTestingModule({
      providers: [
        TaskActions,
        { provide: CreateTaskService, useValue: { execute: createTask } },
        { provide: FindAllTasksService, useValue: { execute: findAllTasks } },
        {
          provide: FindTaskByUuidService,
          useValue: { execute: findTaskByUuid },
        },
        {
          provide: UpdateTaskDetailsService,
          useValue: { execute: updateTaskDetails },
        },
        {
          provide: UpdateTaskStatusService,
          useValue: { execute: updateTaskStatus },
        },
        { provide: DeleteTaskService, useValue: { execute: deleteTask } },
      ],
    }).compile();
    actions = module.get(TaskActions);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('tasks.create', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = { name: 'Groceries' };
      const result = task;
      createTask.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.create'].execute(
        actor,
        payload,
      );

      expect(createTask).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        payload,
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      createTask.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.create'].execute(
          { uuid: 'owner-1' },
          { name: 'Groceries' },
        ),
      ).rejects.toBe(error);
    });
  });
  describe('tasks.findAll', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = {};
      const result: TaskEntity[] = [];
      findAllTasks.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.findAll'].execute(
        actor,
        payload,
      );

      expect(findAllTasks).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        payload,
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      findAllTasks.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.findAll'].execute({ uuid: 'owner-1' }, {}),
      ).rejects.toBe(error);
    });
  });
  describe('tasks.findByUuid', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = { uuid: 'task-1' };
      const result = task;
      findTaskByUuid.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.findByUuid'].execute(
        actor,
        payload,
      );

      expect(findTaskByUuid).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        payload,
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      findTaskByUuid.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.findByUuid'].execute(
          { uuid: 'owner-1' },
          { uuid: 'task-1' },
        ),
      ).rejects.toBe(error);
    });
  });
  describe('tasks.updateDetails', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = { uuid: 'task-1', description: null };
      const result = task;
      updateTaskDetails.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.updateDetails'].execute(
        actor,
        payload,
      );

      expect(updateTaskDetails).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        { uuid: payload.uuid },
        { description: null },
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      updateTaskDetails.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.updateDetails'].execute(
          { uuid: 'owner-1' },
          { uuid: 'task-1', description: null },
        ),
      ).rejects.toBe(error);
    });
  });
  describe('tasks.updateStatus', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = { uuid: 'task-1', status: TaskStatus.IN_PROGRESS };
      const result = task;
      updateTaskStatus.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.updateStatus'].execute(
        actor,
        payload,
      );

      expect(updateTaskStatus).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        { uuid: payload.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      updateTaskStatus.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.updateStatus'].execute(
          { uuid: 'owner-1' },
          { uuid: 'task-1', status: TaskStatus.IN_PROGRESS },
        ),
      ).rejects.toBe(error);
    });
  });
  describe('tasks.delete', () => {
    it('delegates with the actor as owner and returns the result', async () => {
      const actor = { uuid: 'owner-1' };
      const payload = { uuid: 'task-1' };
      const result = new DeleteResponse(true);
      deleteTask.mockResolvedValue(result);

      const returned = await actions.handlers['tasks.delete'].execute(
        actor,
        payload,
      );

      expect(deleteTask).toHaveBeenCalledExactlyOnceWith(
        { uuid: actor.uuid },
        payload,
      );
      expect(returned).toBe(result);
    });

    it('preserves domain errors', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      deleteTask.mockRejectedValue(error);

      await expect(
        actions.handlers['tasks.delete'].execute(
          { uuid: 'owner-1' },
          { uuid: 'task-1' },
        ),
      ).rejects.toBe(error);
    });
  });
});
