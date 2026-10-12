import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionResponse } from '#src/actions/responses/action.response.js';
import { LiliService } from '#src/actions/services/lili/lili.service.js';
import { DeleteResponse } from '#src/shared/responses/delete.response.js';
import type { UpdateTaskStatusDto } from '#src/tasks/dto/update-task-status.dto.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TasksController } from '#src/tasks/tasks.controller.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('TasksController', () => {
  let module: TestingModule;
  let controller: TasksController;
  const execute = vi.fn<LiliService['execute']>();

  beforeEach(async () => {
    execute.mockReset();
    module = await Test.createTestingModule({
      providers: [
        TasksController,
        { provide: LiliService, useValue: { execute } },
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
      execute.mockResolvedValue(new ActionResponse('tasks.create', task));

      const result = await controller.create(session, dto);

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.create',
        payload: dto,
      });
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
      execute.mockRejectedValue(error);

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
      execute.mockResolvedValue(new ActionResponse('tasks.findAll', [task]));

      const dto = { search: 'planif' };
      const result = await controller.findAll(session, dto);

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.findAll',
        payload: dto,
      });
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
      execute.mockRejectedValue(error);

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
      execute.mockResolvedValue(new ActionResponse('tasks.findByUuid', task));

      const result = await controller.findByUuid(session, { uuid: 'task-1' });

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.findByUuid',
        payload: { uuid: 'task-1' },
      });
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
      execute.mockRejectedValue(error);

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
      execute.mockResolvedValue(
        new ActionResponse('tasks.updateDetails', task),
      );

      const result = await controller.updateDetails(
        session,
        { uuid: 'task-1' },
        dto,
      );

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.updateDetails',
        payload: { ...dto, uuid: 'task-1' },
      });
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
      execute.mockRejectedValue(error);

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
      execute.mockResolvedValue(new ActionResponse('tasks.updateStatus', task));

      const result = await controller.updateStatus(
        session,
        { uuid: 'task-1' },
        dto,
      );

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.updateStatus',
        payload: { ...dto, uuid: 'task-1' },
      });
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
      execute.mockRejectedValue(error);

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
      execute.mockResolvedValue(new ActionResponse('tasks.delete', response));

      const result = await controller.delete(session, { uuid: 'task-1' });

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        actor: { uuid: 'user-1' },
        action: 'tasks.delete',
        payload: { uuid: 'task-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('propagates the service error', async () => {
      const session = {
        user: { uuid: 'user-1', email: 'member@example.com' },
        token: 'session-token',
      };

      const error = new TaskConflictException('Task cannot be modified.');
      execute.mockRejectedValue(error);

      await expect(controller.delete(session, { uuid: 'task-1' })).rejects.toBe(
        error,
      );
    });
  });
});
