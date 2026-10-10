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
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';
import { TasksModule } from '#src/tasks/tasks.module.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('Tasks', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let create: CreateTaskService;
  let findAll: FindAllTasksService;
  let findByUuid: FindTaskByUuidService;
  let updateDetails: UpdateTaskDetailsService;
  let updateStatus: UpdateTaskStatusService;
  let deleteTask: DeleteTaskService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TasksModule,
      ],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    create = module.get(CreateTaskService);
    findAll = module.get(FindAllTasksService);
    findByUuid = module.get(FindTaskByUuidService);
    updateDetails = module.get(UpdateTaskDetailsService);
    updateStatus = module.get(UpdateTaskStatusService);
    deleteTask = module.get(DeleteTaskService);
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-e2e-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-e2e-' } },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-e2e-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-e2e-' } },
    });
    await module.close();
  });

  describe('Principal tasks', () => {
    it('persists a pending task for the acting user', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });

      const created = await create.execute(
        { uuid: user.uuid },
        {
          name: '  Groceries  ',
        },
      );
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
          TaskStatus.PENDING,
          TaskPriority.MEDIUM,
          null,
          null,
          null,
          null,
        ),
      );
      expect(stored).toMatchObject({
        userUuid: user.uuid,
        name: 'Groceries',
        status: TaskStatus.PENDING,
      });
    });

    it('preserves date-only values, explicit midnight and a separate reminder', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });

      const created = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          start: '2026-07-10',
          end: '2026-07-11T00:00',
          reminder: '2026-07-09T06:00',
        },
      );
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
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });

      const result = create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          start: '2026-03-29T02:30',
        },
      );

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
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const subtask = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          parentUuid: parent.uuid,
        },
      );

      const found = await findByUuid.execute(
        { uuid: user.uuid },
        { uuid: subtask.uuid },
      );

      expect(found).toEqual(subtask);
    });
  });

  describe('Subtasks', () => {
    it('persists a pending subtask under its principal for the same user', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      const subtask = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          parentUuid: parent.uuid,
        },
      );

      expect(subtask).toEqual(
        new TaskEntity(
          subtask.uuid,
          user.uuid,
          parent.uuid,
          'Groceries',
          null,
          TaskStatus.PENDING,
          TaskPriority.MEDIUM,
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
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const otherUser = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-other',
          email: 'other@example.com',
        },
      });
      const parent = await create.execute(
        { uuid: owner.uuid },
        { name: 'Dinner' },
      );

      const result = create.execute(
        { uuid: otherUser.uuid },
        {
          name: 'Groceries',
          parentUuid: parent.uuid,
        },
      );

      await expect(result).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.count({ where: { userUuid: otherUser.uuid } }),
      ).toBe(0);
    });

    it('rejects a soft-deleted principal without creating a subtask', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await prisma.task.create({
        data: { userUuid: user.uuid, name: 'Dinner', deletedAt: new Date() },
      });

      const result = create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          parentUuid: parent.uuid,
        },
      );

      await expect(result).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.count({ where: { parentUuid: parent.uuid } }),
      ).toBe(0);
    });

    it('rejects a second level of subtasks', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const parent = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const subtask = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Groceries',
          parentUuid: parent.uuid,
        },
      );

      const result = create.execute(
        { uuid: user.uuid },
        {
          name: 'Vegetables',
          parentUuid: subtask.uuid,
        },
      );

      await expect(result).rejects.toThrow(
        new TaskConflictException('Subtasks cannot have their own subtasks.'),
      );
      expect(
        await prisma.task.count({ where: { parentUuid: subtask.uuid } }),
      ).toBe(0);
    });

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'rejects a %s principal',
      async (status) => {
        const user = await prisma.user.create({
          data: {
            googleSubject: 'tasks-e2e-owner',
            email: 'owner@example.com',
          },
        });
        const parent = await prisma.task.create({
          data: { userUuid: user.uuid, name: 'Dinner', status },
        });

        const result = create.execute(
          { uuid: user.uuid },
          {
            name: 'Groceries',
            parentUuid: parent.uuid,
          },
        );

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

  describe('Listing', () => {
    it('lists visible tasks of the acting user in creation order', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-other',
          email: 'other@example.com',
        },
      });
      const first = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const second = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Ingredients',
          parentUuid: first.uuid,
        },
      );
      await prisma.task.update({
        where: { uuid: first.uuid },
        data: { createdAt: new Date('2026-10-09T10:00:00Z') },
      });
      await prisma.task.update({
        where: { uuid: second.uuid },
        data: { createdAt: new Date('2026-10-09T11:00:00Z') },
      });
      await create.execute({ uuid: other.uuid }, { name: 'Private' });
      await prisma.task.create({
        data: { userUuid: user.uuid, name: 'Deleted', deletedAt: new Date() },
      });

      expect(await findAll.execute({ uuid: user.uuid })).toEqual([
        first,
        second,
      ]);
    });

    it('returns an empty list for a user without visible tasks', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });

      expect(await findAll.execute({ uuid: user.uuid })).toEqual([]);
    });
  });

  describe('Updating details', () => {
    it('persists supplied fields and preserves omitted fields', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Dinner',
          description: 'Family',
          start: '2026-10-10',
          end: '2026-10-11',
          reminder: '2026-10-09T18:00',
        },
      );

      const updated = await updateDetails.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        {
          name: '  Lunch  ',
          end: '2026-10-12T00:00',
        },
      );

      expect(updated).toEqual({
        ...task,
        name: 'Lunch',
        end: new TaskDateEntity('2026-10-12', '00:00'),
      });
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(updated);
    });

    it('persists explicit null values as cleared fields', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Dinner',
          description: 'Family',
          start: '2026-10-10',
          end: '2026-10-11',
          reminder: '2026-10-09T18:00',
        },
      );

      await updateDetails.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        {
          description: null,
          start: null,
          end: null,
          reminder: null,
        },
      );

      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual({
        ...task,
        description: null,
        start: null,
        end: null,
        reminder: null,
      });
    });

    it('rejects a partial update that would invert the stored range', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Dinner',
          start: '2026-10-10',
          end: '2026-10-11',
        },
      );

      await expect(
        updateDetails.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          {
            name: 'Lunch',
            end: '2026-10-09',
          },
        ),
      ).rejects.toThrow(
        new TaskValidationException('Task end cannot precede its start.'),
      );
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });

    it('rejects a nonexistent Madrid local time without persisting other fields', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      await expect(
        updateDetails.execute(
          { uuid: user.uuid },
          { uuid: task.uuid },
          {
            name: 'Lunch',
            reminder: '2026-03-29T02:30',
          },
        ),
      ).rejects.toBeInstanceOf(TaskValidationException);
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });
  });

  describe('Updating status', () => {
    it.each([
      TaskStatus.PENDING,
      TaskStatus.SCHEDULED,
      TaskStatus.IN_PROGRESS,
      TaskStatus.PAUSED,
      TaskStatus.BLOCKED,
      TaskStatus.COMPLETED,
      TaskStatus.CANCELLED,
    ] as const)('persists %s without changing task details', async (status) => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Dinner',
          start: '2026-10-10',
        },
      );

      const updated = await updateStatus.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
        {
          status,
        },
      );

      expect(updated).toEqual({ ...task, status });
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(updated);
    });
  });

  describe('Deletion', () => {
    it('removes a task from persistence', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      const result = await deleteTask.execute(
        { uuid: user.uuid },
        { uuid: task.uuid },
      );

      expect(result).toEqual({ success: true });
      expect(
        await prisma.task.findUnique({ where: { uuid: task.uuid } }),
      ).toBeNull();
    });

    it('deletes subtasks with their principal through the existing cascade', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const subtask = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Ingredients',
          parentUuid: task.uuid,
        },
      );

      await deleteTask.execute({ uuid: user.uuid }, { uuid: task.uuid });

      expect(
        await prisma.task.findUnique({ where: { uuid: subtask.uuid } }),
      ).toBeNull();
    });

    it('deletes a subtask while preserving its principal', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );
      const subtask = await create.execute(
        { uuid: user.uuid },
        {
          name: 'Ingredients',
          parentUuid: task.uuid,
        },
      );

      await deleteTask.execute({ uuid: user.uuid }, { uuid: subtask.uuid });

      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
      expect(
        await prisma.task.findUnique({ where: { uuid: subtask.uuid } }),
      ).toBeNull();
    });
  });

  describe('Updating details access', () => {
    it('rejects another user task without changing it', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-other',
          email: 'other@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      await expect(
        updateDetails.execute(
          { uuid: other.uuid },
          { uuid: task.uuid },
          { name: 'Changed' },
        ),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });

    it('rejects a soft-deleted task without changing persistence', async () => {
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await prisma.task.create({
        data: {
          userUuid: other.uuid,
          name: 'Dinner',
          deletedAt: new Date('2026-10-09T10:00:00Z'),
        },
      });

      await expect(
        updateDetails.execute(
          { uuid: other.uuid },
          { uuid: task.uuid },
          { name: 'Changed' },
        ),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.findUnique({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });
  });

  describe('Updating status access', () => {
    it('rejects another user task without changing it', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-other',
          email: 'other@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      await expect(
        updateStatus.execute(
          { uuid: other.uuid },
          { uuid: task.uuid },
          { status: TaskStatus.COMPLETED },
        ),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });

    it('rejects a soft-deleted task without changing persistence', async () => {
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await prisma.task.create({
        data: {
          userUuid: other.uuid,
          name: 'Dinner',
          deletedAt: new Date('2026-10-09T10:00:00Z'),
        },
      });

      await expect(
        updateStatus.execute(
          { uuid: other.uuid },
          { uuid: task.uuid },
          { status: TaskStatus.COMPLETED },
        ),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.findUnique({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });
  });

  describe('Deletion access', () => {
    it('rejects another user task without changing it', async () => {
      const user = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-other',
          email: 'other@example.com',
        },
      });
      const task = await create.execute(
        { uuid: user.uuid },
        { name: 'Dinner' },
      );

      await expect(
        deleteTask.execute({ uuid: other.uuid }, { uuid: task.uuid }),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await findByUuid.execute({ uuid: user.uuid }, { uuid: task.uuid }),
      ).toEqual(task);
    });

    it('rejects a soft-deleted task without changing persistence', async () => {
      const other = await prisma.user.create({
        data: {
          googleSubject: 'tasks-e2e-owner',
          email: 'owner@example.com',
        },
      });
      const task = await prisma.task.create({
        data: {
          userUuid: other.uuid,
          name: 'Dinner',
          deletedAt: new Date('2026-10-09T10:00:00Z'),
        },
      });

      await expect(
        deleteTask.execute({ uuid: other.uuid }, { uuid: task.uuid }),
      ).rejects.toThrow(new TaskNotFoundException());
      expect(
        await prisma.task.findUnique({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });
  });
});
