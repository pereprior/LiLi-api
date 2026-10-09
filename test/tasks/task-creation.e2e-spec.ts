import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '#src/database/prisma.service.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { TasksModule } from '#src/tasks/tasks.module.js';

describe('Task creation and persistence', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: CreateTaskService;
  let findTaskByUuid: FindTaskByUuidService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TasksModule,
      ],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    service = module.get(CreateTaskService);
    findTaskByUuid = module.get(FindTaskByUuidService);
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'task-creation-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'task-creation-' } },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'task-creation-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'task-creation-' } },
    });
    await module.close();
  });

  describe('Principal tasks', () => {
    it('persists a pending task for the acting user', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });

      const created = await service.execute(user.uuid, {
        name: '  Groceries  ',
      });
      const stored = await prisma.task.findUniqueOrThrow({
        where: { uuid: created.uuid },
      });

      expect(created).toEqual(
        new TaskEntity(
          created.uuid,
          user.uuid,
          null,
          'Groceries',
          null,
          'PENDING',
          null,
          null,
          null,
          null,
        ),
      );
      expect(stored).toMatchObject({
        userUuid: user.uuid,
        name: 'Groceries',
        status: 'PENDING',
      });
    });

    it('preserves date-only values, explicit midnight and a separate reminder', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });

      const created = await service.execute(user.uuid, {
        name: 'Groceries',
        start: '2026-07-10',
        end: '2026-07-11T00:00',
        reminder: '2026-07-09T06:00',
      });
      const stored = await prisma.task.findUniqueOrThrow({
        where: { uuid: created.uuid },
      });

      expect(created.start).toEqual(new TaskDateEntity('2026-07-10'));
      expect(created.end).toEqual(new TaskDateEntity('2026-07-11', '00:00'));
      expect(created.reminder).toEqual(
        new TaskDateEntity('2026-07-09', '06:00'),
      );
      expect(stored).toMatchObject({
        startDate: new Date('2026-07-09T22:00:00Z'),
        startHasTime: false,
        endDate: new Date('2026-07-10T22:00:00Z'),
        endHasTime: true,
        reminderDate: new Date('2026-07-09T04:00:00Z'),
        reminderHasTime: true,
      });
    });

    it('does not persist a clock time skipped by the Madrid spring transition', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });

      const result = service.execute(user.uuid, {
        name: 'Groceries',
        start: '2026-03-29T02:30',
      });

      await expect(result).rejects.toThrow(
        new TaskValidationException(
          'The selected time does not exist in Europe/Madrid.',
        ),
      );
      expect(await prisma.task.count({ where: { userUuid: user.uuid } })).toBe(
        0,
      );
    });
  });

  describe('Task lookup', () => {
    it('returns a visible subtask through the lookup service', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await service.execute(user.uuid, { name: 'Dinner' });
      const subtask = await service.execute(user.uuid, {
        name: 'Groceries',
        parentUuid: parent.uuid,
      });

      const found = await findTaskByUuid.execute(user.uuid, subtask.uuid);

      expect(found).toEqual(subtask);
    });
  });

  describe('Subtasks', () => {
    it('persists a pending subtask under its principal for the same user', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await service.execute(user.uuid, { name: 'Dinner' });

      const subtask = await service.execute(user.uuid, {
        name: 'Groceries',
        parentUuid: parent.uuid,
      });

      expect(subtask).toEqual(
        new TaskEntity(
          subtask.uuid,
          user.uuid,
          parent.uuid,
          'Groceries',
          null,
          'PENDING',
          null,
          null,
          null,
          null,
        ),
      );
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: subtask.uuid } }),
      ).toMatchObject({ userUuid: user.uuid, parentUuid: parent.uuid });
    });

    it('rejects a principal belonging to another user without creating a task', async () => {
      const owner = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });
      const otherUser = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-other',
          email: 'other@example.com',
        },
      });
      const parent = await service.execute(owner.uuid, { name: 'Dinner' });

      const result = service.execute(otherUser.uuid, {
        name: 'Groceries',
        parentUuid: parent.uuid,
      });

      await expect(result).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.count({ where: { userUuid: otherUser.uuid } }),
      ).toBe(0);
    });

    it('rejects a soft-deleted principal without creating a subtask', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await prisma.task.create({
        data: { userUuid: user.uuid, name: 'Dinner', deletedAt: new Date() },
      });

      const result = service.execute(user.uuid, {
        name: 'Groceries',
        parentUuid: parent.uuid,
      });

      await expect(result).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.count({ where: { parentUuid: parent.uuid } }),
      ).toBe(0);
    });

    it('rejects a second level of subtasks', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'task-creation-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await service.execute(user.uuid, { name: 'Dinner' });
      const subtask = await service.execute(user.uuid, {
        name: 'Groceries',
        parentUuid: parent.uuid,
      });

      const result = service.execute(user.uuid, {
        name: 'Vegetables',
        parentUuid: subtask.uuid,
      });

      await expect(result).rejects.toThrow(
        new TaskConflictException('Subtasks cannot have their own subtasks.'),
      );
      expect(
        await prisma.task.count({ where: { parentUuid: subtask.uuid } }),
      ).toBe(0);
    });

    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'rejects a %s principal',
      async (status) => {
        const user = await prisma.user.create({
          data: {
            googleSubject: 'task-creation-owner',
            email: 'owner@example.com',
          },
        });
        const parent = await prisma.task.create({
          data: { userUuid: user.uuid, name: 'Dinner', status },
        });

        const result = service.execute(user.uuid, {
          name: 'Groceries',
          parentUuid: parent.uuid,
        });

        await expect(result).rejects.toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks cannot receive new subtasks.',
          ),
        );
        expect(
          await prisma.task.count({ where: { parentUuid: parent.uuid } }),
        ).toBe(0);
      },
    );
  });
});
