import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '#src/database/prisma.service.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';
import { TasksModule } from '#src/tasks/tasks.module.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('Task lifecycle rules and persistence', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let repository: TaskRepository;
  let create: CreateTaskService;
  let updateDetails: UpdateTaskDetailsService;
  let updateStatus: UpdateTaskStatusService;
  let remove: DeleteTaskService;
  let find: FindTaskByUuidService;
  let list: FindAllTasksService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TasksModule,
      ],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    repository = module.get(TaskRepository);
    create = module.get(CreateTaskService);
    updateDetails = module.get(UpdateTaskDetailsService);
    updateStatus = module.get(UpdateTaskStatusService);
    remove = module.get(DeleteTaskService);
    find = module.get(FindTaskByUuidService);
    list = module.get(FindAllTasksService);
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-lifecycle-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-lifecycle-' } },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-lifecycle-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-lifecycle-' } },
    });
    await module.close();
  });

  describe('Terminal states', () => {
    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'preserves details on a %s task',
      async (status) => {
        const user = await prisma.user.create({
          data: {
            googleSubject: 'tasks-lifecycle-owner',
            email: 'owner@example.com',
          },
        });
        const task = await create.execute(
          { uuid: user.uuid },
          { name: 'Dinner' },
        );
        await updateStatus.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          { status },
        );
        const stored = await prisma.task.findUniqueOrThrow({
          where: { uuid: task.uuid },
        });

        const result = updateDetails.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          { name: 'Changed' },
        );

        await expect(result).rejects.toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks are immutable.',
          ),
        );
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(stored);
      },
    );

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'prevents reopening a %s task',
      async (status) => {
        const user = await prisma.user.create({
          data: {
            googleSubject: 'tasks-lifecycle-owner',
            email: 'owner@example.com',
          },
        });
        const task = await create.execute(
          { uuid: user.uuid },
          { name: 'Dinner' },
        );
        await updateStatus.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          { status },
        );
        const stored = await prisma.task.findUniqueOrThrow({
          where: { uuid: task.uuid },
        });

        const result = updateStatus.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          { status: TaskStatus.PENDING },
        );

        await expect(result).rejects.toBeInstanceOf(TaskConflictException);
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(stored);
      },
    );
  });

  describe('Scheduling', () => {
    it('requires a start when scheduling', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      const result = updateStatus.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        { status: TaskStatus.SCHEDULED },
      );

      await expect(result).rejects.toThrow(
        new TaskValidationException('Scheduled tasks require a start date.'),
      );
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });

    it('preserves the start when a scheduled task tries to clear it', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner', start: '2026-10-10' },
      );
      const scheduled = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        { status: TaskStatus.SCHEDULED },
      );

      const result = updateDetails.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        { start: null },
      );

      await expect(result).rejects.toBeInstanceOf(TaskValidationException);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(scheduled);
    });
  });

  describe('Principal and subtasks', () => {
    it('prevents a subtask from starting under a pending principal', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );

      const result = updateStatus.execute(
        { uuid: user.uuid },
        { uuid: child.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );

      await expect(result).rejects.toBeInstanceOf(TaskConflictException);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: child.uuid }),
      ).toEqual(child);
    });

    it('prevents a principal from returning to pending with an active subtask', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const active = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: child.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );

      const result = updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.PENDING },
      );

      await expect(result).rejects.toBeInstanceOf(TaskConflictException);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: principal.uuid }),
      ).toEqual(active);
    });

    it('rejects completion until visible subtasks are finished', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const active = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );

      const result = updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.COMPLETED },
      );

      await expect(result).rejects.toBeInstanceOf(TaskConflictException);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: principal.uuid }),
      ).toEqual(active);
    });

    it('completes a principal with completed or cancelled visible subtasks', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const done = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const cancelled = await create.execute(
        { uuid: user.uuid },
        { name: 'Dessert', parentUuid: principal.uuid },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: done.uuid },
        { status: TaskStatus.COMPLETED },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: cancelled.uuid },
        { status: TaskStatus.CANCELLED },
      );

      const completed = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.COMPLETED },
      );

      expect(completed.status).toBe(TaskStatus.COMPLETED);
    });

    it('cancels visible subtasks while preserving deleted history', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const historical = await prisma.task.create({
        data: {
          userUuid: user.uuid,
          parentUuid: principal.uuid,
          name: 'Old task',
          status: TaskStatus.COMPLETED,
          deletedAt: new Date('2026-10-01T00:00:00Z'),
        },
      });

      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.CANCELLED },
      );

      expect(
        (await find.execute({ uuid: user.uuid }, { uuid: child.uuid })).status,
      ).toBe(TaskStatus.CANCELLED);
      expect(
        await prisma.task.findUniqueOrThrow({
          where: { uuid: historical.uuid },
        }),
      ).toEqual(historical);
    });

    it('does not cancel any task when a visible subtask is completed', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const pending = await create.execute(
        { uuid: user.uuid },
        { name: 'Dessert', parentUuid: principal.uuid },
      );
      const active = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      const completed = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: child.uuid },
        { status: TaskStatus.COMPLETED },
      );

      const result = updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.CANCELLED },
      );

      await expect(result).rejects.toBeInstanceOf(TaskConflictException);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: principal.uuid }),
      ).toEqual(active);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: child.uuid }),
      ).toEqual(completed);
      expect(
        await find.execute({ uuid: user.uuid }, { uuid: pending.uuid }),
      ).toEqual(pending);
    });
  });

  describe('Soft deletion', () => {
    it.each([
      TaskStatus.SCHEDULED,
      TaskStatus.IN_PROGRESS,
      TaskStatus.PAUSED,
      TaskStatus.BLOCKED,
      TaskStatus.COMPLETED,
      TaskStatus.CANCELLED,
    ] as const)('keeps a deleted %s task as hidden history', async (status) => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner', start: '2026-10-10' },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        { status },
      );

      await remove.execute({ uuid: user.uuid }, { uuid: task.uuid });

      const stored = await prisma.task.findUniqueOrThrow({
        where: { uuid: task.uuid },
      });
      expect(stored).toMatchObject({
        name: 'Dinner',
        status,
      });
      expect(stored.deletedAt).toBeInstanceOf(Date);
      await expect(
        find.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(await list.execute({ uuid: user.uuid })).toEqual([]);
    });

    it('archives the principal and all visible subtasks with the same timestamp', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: child.uuid },
        { status: TaskStatus.COMPLETED },
      );
      const historical = await prisma.task.create({
        data: {
          userUuid: user.uuid,
          parentUuid: principal.uuid,
          name: 'Old task',
          status: TaskStatus.CANCELLED,
          deletedAt: new Date('2026-10-01T00:00:00Z'),
        },
      });

      await remove.execute({ uuid: user.uuid }, { uuid: principal.uuid });

      const deletedPrincipal = await prisma.task.findUniqueOrThrow({
        where: { uuid: principal.uuid },
      });
      const deletedChild = await prisma.task.findUniqueOrThrow({
        where: { uuid: child.uuid },
      });
      expect(deletedPrincipal.deletedAt).toBeInstanceOf(Date);
      expect(deletedChild).toMatchObject({
        status: TaskStatus.COMPLETED,
        deletedAt: deletedPrincipal.deletedAt,
      });
      expect(
        await prisma.task.findUniqueOrThrow({
          where: { uuid: historical.uuid },
        }),
      ).toEqual(historical);
      expect(await list.execute({ uuid: user.uuid })).toEqual([]);
    });

    it('archives a started subtask without hiding its principal', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const child = await create.execute(
        { uuid: user.uuid },
        { name: 'Groceries', parentUuid: principal.uuid },
      );
      const active = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: principal.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );
      await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: child.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );

      await remove.execute({ uuid: user.uuid }, { uuid: child.uuid });

      expect(
        await find.execute({ uuid: user.uuid }, { uuid: principal.uuid }),
      ).toEqual(active);
      const storedChild = await prisma.task.findUniqueOrThrow({
        where: { uuid: child.uuid },
      });
      expect(storedChild.status).toBe(TaskStatus.IN_PROGRESS);
      expect(storedChild.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('Atomic operations', () => {
    it('reports not found when a transactional write no longer finds its target', async () => {
      const result = repository.transaction((transaction) =>
        transaction.update('missing-user', 'missing-task', { name: 'Changed' }),
      );

      await expect(result).rejects.toThrow(new TaskNotFoundException());
    });

    it('rolls back every write when a transaction fails', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });

      const result = repository.transaction(async (transaction) => {
        const principal = await transaction.create({
          userUuid: user.uuid,
          name: 'Dinner',
        });
        await transaction.create({
          userUuid: user.uuid,
          name: 'Groceries',
          parentUuid: principal.uuid,
        });
        throw new TaskConflictException('Abort the operation.');
      });

      await expect(result).rejects.toThrow(
        new TaskConflictException('Abort the operation.'),
      );
      expect(await prisma.task.count({ where: { userUuid: user.uuid } })).toBe(
        0,
      );
    });

    it('rejects a stale creation when the principal completes concurrently', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-lifecycle-owner',
          email: 'owner@example.com',
        },
      });
      const principal = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const principalRead = Promise.withResolvers<void>();
      const continueCreation = Promise.withResolvers<void>();
      const creation = repository.transaction(async (transaction) => {
        await transaction.findByUuid(user.uuid, principal.uuid);
        principalRead.resolve();
        await continueCreation.promise;
        return transaction.create({
          userUuid: user.uuid,
          name: 'Groceries',
          parentUuid: principal.uuid,
        });
      });
      const rejectedCreation = expect(creation).rejects.toThrow(
        new TaskConflictException(
          'Task changed during this operation. Please retry.',
        ),
      );
      await principalRead.promise;

      try {
        await updateStatus.execute(
          { uuid: user.uuid },
          { uuid: principal.uuid },
          { status: TaskStatus.COMPLETED },
        );
      } finally {
        continueCreation.resolve();
      }

      await rejectedCreation;
      expect(
        await prisma.task.count({ where: { parentUuid: principal.uuid } }),
      ).toBe(0);
    });
  });
});
