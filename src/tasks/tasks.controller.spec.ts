import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteResponse } from '#src/shared/responses/delete.response.js';
import type { UpdateTaskStatusDto } from '#src/tasks/dto/update-task-status.dto.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';
import { TasksController } from '#src/tasks/tasks.controller.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('TasksController', () => {
  let module: TestingModule;
  let controller: TasksController;
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
        TasksController,
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
    controller = module.get(TasksController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('create', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto = { name: 'Groceries' };
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-10-15', '00:00'),
        null,
        null,
        new Date('2026-10-16T10:00:00Z'),
      );
      createTask.mockResolvedValue(task);

      const result = await controller.create(session, dto);

      expect(createTask).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        dto,
      );
      expect(result).toEqual({
        uuid: 'task-1',
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: '00:00' },
        end: null,
        reminder: null,
      });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto = { name: 'Groceries' };
      const error = new TaskConflictException('Task cannot be modified.');
      createTask.mockRejectedValue(error);

      await expect(controller.create(session, dto)).rejects.toBe(error);
    });
  });

  describe('findAll', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-10-15', '00:00'),
        null,
        null,
        new Date('2026-10-16T10:00:00Z'),
      );
      findAllTasks.mockResolvedValue([task]);

      const dto = { search: 'planif' };
      const result = await controller.findAll(session, dto);

      expect(findAllTasks).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        dto,
      );
      expect(result).toEqual([
        {
          uuid: 'task-1',
          userUuid: 'user-1',
          parentUuid: null,
          name: 'Groceries',
          description: null,
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          start: { date: '2026-10-15', time: '00:00' },
          end: null,
          reminder: null,
        },
      ]);
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const error = new TaskConflictException('Task cannot be modified.');
      findAllTasks.mockRejectedValue(error);

      await expect(controller.findAll(session)).rejects.toBe(error);
    });
  });

  describe('findByUuid', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-10-15', '00:00'),
        null,
        null,
        new Date('2026-10-16T10:00:00Z'),
      );
      findTaskByUuid.mockResolvedValue(task);

      const result = await controller.findByUuid(session, { uuid: 'task-1' });

      expect(findTaskByUuid).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
      );
      expect(result).toEqual({
        uuid: 'task-1',
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: '00:00' },
        end: null,
        reminder: null,
      });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const error = new TaskConflictException('Task cannot be modified.');
      findTaskByUuid.mockRejectedValue(error);

      await expect(
        controller.findByUuid(session, { uuid: 'task-1' }),
      ).rejects.toBe(error);
    });
  });

  describe('updateDetails', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto = { name: 'Groceries' };
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-10-15', '00:00'),
        null,
        null,
        new Date('2026-10-16T10:00:00Z'),
      );
      updateTaskDetails.mockResolvedValue(task);

      const result = await controller.updateDetails(
        session,
        { uuid: 'task-1' },
        dto,
      );

      expect(updateTaskDetails).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        dto,
      );
      expect(result).toEqual({
        uuid: 'task-1',
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: '00:00' },
        end: null,
        reminder: null,
      });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto = { name: 'Groceries' };
      const error = new TaskConflictException('Task cannot be modified.');
      updateTaskDetails.mockRejectedValue(error);

      await expect(
        controller.updateDetails(session, { uuid: 'task-1' }, dto),
      ).rejects.toBe(error);
    });
  });

  describe('updateStatus', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto: UpdateTaskStatusDto = { status: TaskStatus.IN_PROGRESS };
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-10-15', '00:00'),
        null,
        null,
        new Date('2026-10-16T10:00:00Z'),
      );
      updateTaskStatus.mockResolvedValue(task);

      const result = await controller.updateStatus(
        session,
        { uuid: 'task-1' },
        dto,
      );

      expect(updateTaskStatus).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
        dto,
      );
      expect(result).toEqual({
        uuid: 'task-1',
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: '00:00' },
        end: null,
        reminder: null,
      });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };
      const dto: UpdateTaskStatusDto = { status: TaskStatus.IN_PROGRESS };
      const error = new TaskConflictException('Task cannot be modified.');
      updateTaskStatus.mockRejectedValue(error);

      await expect(
        controller.updateStatus(session, { uuid: 'task-1' }, dto),
      ).rejects.toBe(error);
    });
  });

  describe('delete', () => {
    it('uses the session owner and returns the public response', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const response = new DeleteResponse(true);
      deleteTask.mockResolvedValue(response);

      const result = await controller.delete(session, { uuid: 'task-1' });

      expect(deleteTask).toHaveBeenCalledExactlyOnceWith(
        { uuid: 'user-1' },
        { uuid: 'task-1' },
      );
      expect(result).toEqual({ success: true });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const error = new TaskConflictException('Task cannot be modified.');
      deleteTask.mockRejectedValue(error);

      await expect(controller.delete(session, { uuid: 'task-1' })).rejects.toBe(
        error,
      );
    });
  });
});
