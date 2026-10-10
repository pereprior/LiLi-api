import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '#src/app.module.js';
import { authConfig } from '#src/auth/config/auth.config.js';
import { CreateSessionService } from '#src/auth/sessions/services/create-session/create-session.service.js';
import type { AuthConfig } from '#src/auth/types/auth-config.type.js';
import { configureApp } from '#src/config/app.config.js';
import { configureOpenApi } from '#src/config/openapi.config.js';
import { PrismaService } from '#src/database/prisma.service.js';
import type { TaskResponse } from '#src/tasks/responses/task.response.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('Tasks HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  let origin: string;
  let prisma: PrismaService;
  let createSession: CreateSessionService;
  let userUuid: string;
  let cookie: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await configureOpenApi(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    origin = module.get<AuthConfig>(authConfig.KEY).appOrigin;
    prisma = module.get(PrismaService);
    createSession = module.get(CreateSessionService);
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-http-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-http-' } },
    });
    const user = await prisma.user.create({
      data: { googleSubject: 'tasks-http-owner', email: 'member@example.com' },
    });
    userUuid = user.uuid;
    const session = await createSession.execute(userUuid);
    cookie = `lili_session=${session.token}`;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'tasks-http-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'tasks-http-' } },
    });
    await app.close();
  });

  describe('OpenAPI', () => {
    it('serves documentation for all six task operations', async () => {
      const response = await fetch(new URL('/api-json', baseUrl));
      const document = (await response.json()) as OpenAPIObject;

      expect(response.status).toBe(200);
      expect([
        document.paths['/tasks']?.post?.operationId,
        document.paths['/tasks']?.get?.operationId,
        document.paths['/tasks/{uuid}']?.get?.operationId,
        document.paths['/tasks/{uuid}']?.patch?.operationId,
        document.paths['/tasks/{uuid}/status']?.patch?.operationId,
        document.paths['/tasks/{uuid}']?.delete?.operationId,
      ]).toEqual([
        'createTask',
        'findAllTasks',
        'findTaskByUuid',
        'updateTaskDetails',
        'updateTaskStatus',
        'deleteTask',
      ]);
    });
  });

  describe('Authentication and origin', () => {
    it.each([
      ['GET', '/tasks'],
      ['POST', '/tasks'],
      ['GET', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1'],
      ['PATCH', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1'],
      ['PATCH', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1/status'],
      ['DELETE', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1'],
    ])('rejects unauthenticated %s %s', async (method, path) => {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: { origin },
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        statusCode: 401,
        message: 'Unauthorized',
      });
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });

    it('rejects an expired session', async () => {
      await prisma.session.updateMany({
        where: { userUuid },
        data: { expiresAt: new Date(0) },
      });

      const response = await fetch(new URL('/tasks', baseUrl), {
        headers: { cookie },
      });

      expect(response.status).toBe(401);
    });

    it.each([
      ['POST', '/tasks'],
      ['PATCH', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1'],
      ['PATCH', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1/status'],
      ['DELETE', '/tasks/91879373-16a2-47ea-9baa-40e15fef2ad1'],
    ])('rejects a foreign origin for %s %s', async (method, path) => {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: { cookie, origin: 'https://other.example.com' },
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        statusCode: 403,
        message: 'Invalid request origin.',
        error: 'Forbidden',
      });
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });

    it('rejects a write without Origin or Referer', async () => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Groceries' }),
      });

      expect(response.status).toBe(403);
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });

    it('accepts a write with a matching Referer when Origin is absent', async () => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: {
          cookie,
          referer: `${origin}/tasks`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Groceries' }),
      });

      expect(response.status).toBe(201);
      expect(await prisma.task.count({ where: { userUuid } })).toBe(1);
    });
  });

  describe('POST /tasks', () => {
    it('creates a pending task with Madrid dates and an explicit public response', async () => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '  Groceries  ',
          description: 'For the week',
          start: '2026-10-15',
          end: '2026-10-16T00:00',
          reminder: '2026-10-14T09:00',
        }),
      });
      const task = (await response.json()) as TaskResponse;

      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(task).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Groceries',
        description: 'For the week',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: null },
        end: { date: '2026-10-16', time: '00:00' },
        reminder: { date: '2026-10-14', time: '09:00' },
      });
      const stored = await prisma.task.findUniqueOrThrow({
        where: { uuid: task.uuid },
      });
      expect(stored.endDate?.toISOString()).toBe('2026-10-15T22:00:00.000Z');
    });

    it.each([
      TaskPriority.LOW,
      TaskPriority.MEDIUM,
      TaskPriority.HIGH,
    ] as const)(
      'creates and retrieves a task with %s priority',
      async (priority) => {
        const response = await fetch(new URL('/tasks', baseUrl), {
          method: 'POST',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Groceries', priority }),
        });
        const task = (await response.json()) as TaskResponse;

        expect(response.status).toBe(201);
        expect(task.priority).toBe(priority);
        const stored = await prisma.task.findUniqueOrThrow({
          where: { uuid: task.uuid },
        });
        expect(stored.priority).toBe(priority);

        const found = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
          headers: { cookie },
        });

        expect(found.status).toBe(200);
        expect(await found.json()).toEqual(task);
      },
    );

    it('defaults a subtask to medium independently of its principal priority', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Dinner', priority: TaskPriority.HIGH },
      });

      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Groceries', parentUuid: principal.uuid }),
      });
      const task = (await response.json()) as TaskResponse;

      expect(response.status).toBe(201);
      expect(task.priority).toBe(TaskPriority.MEDIUM);
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }))
          .priority,
      ).toBe(TaskPriority.MEDIUM);
    });

    it('stores a reminder without start or end dates', async () => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Groceries', reminder: '2026-10-15' }),
      });
      const task = (await response.json()) as TaskResponse;

      expect(response.status).toBe(201);
      expect(task).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: null,
        end: null,
        reminder: { date: '2026-10-15', time: null },
      });
    });

    it.each([
      ['missing name', {}],
      ['null name', { name: null }],
      ['blank name', { name: '  ' }],
      ['non-string name', { name: 123 }],
      ['non-string description', { name: 'Groceries', description: 1 }],
      ['null priority', { name: 'Groceries', priority: null }],
      ['unknown priority', { name: 'Groceries', priority: 'URGENT' }],
      ['lowercase priority', { name: 'Groceries', priority: 'low' }],
      ['non-string priority', { name: 'Groceries', priority: 1 }],
      [
        'chosen owner',
        { name: 'Groceries', userUuid: '91879373-16a2-47ea-9baa-40e15fef2ad1' },
      ],
      ['chosen status', { name: 'Groceries', status: TaskStatus.IN_PROGRESS }],
      ['unknown property', { name: 'Groceries', extra: true }],
      ['invalid parent UUID', { name: 'Groceries', parentUuid: 'invalid' }],
      ['invalid calendar date', { name: 'Groceries', start: '2026-02-30' }],
      ['invalid hour', { name: 'Groceries', start: '2026-10-15T24:00' }],
      ['UTC suffix', { name: 'Groceries', start: '2026-10-15T10:00Z' }],
      ['UTC offset', { name: 'Groceries', start: '2026-10-15T10:00+02:00' }],
      ['seconds', { name: 'Groceries', start: '2026-10-15T10:00:00' }],
      [
        'nonexistent Madrid time',
        { name: 'Groceries', start: '2026-03-29T02:30' },
      ],
      [
        'end before start day',
        { name: 'Groceries', start: '2026-10-16', end: '2026-10-15' },
      ],
      [
        'end before start time',
        {
          name: 'Groceries',
          start: '2026-10-15T11:00',
          end: '2026-10-15T10:00',
        },
      ],
    ])('rejects %s without creating a task', async (_label, body) => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(400);
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });

    it('creates a single level of subtasks through HTTP', async () => {
      const principalResponse = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Groceries' }),
      });
      const principal = (await principalResponse.json()) as TaskResponse;
      expect(principalResponse.status).toBe(201);

      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Milk', parentUuid: principal.uuid }),
      });
      const subtask = (await response.json()) as TaskResponse;

      expect(response.status).toBe(201);
      expect(subtask).toEqual({
        uuid: subtask.uuid,
        userUuid,
        parentUuid: principal.uuid,
        name: 'Milk',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: null,
        end: null,
        reminder: null,
      });
    });

    it('rejects creating a second level of subtasks', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });
      const subtask = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nested', parentUuid: subtask.uuid }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        statusCode: 409,
        message: 'Subtasks cannot have their own subtasks.',
      });
      expect(await prisma.task.count({ where: { userUuid } })).toBe(2);
    });

    it('hides a principal belonging to another user', async () => {
      const other = await prisma.user.create({
        data: { googleSubject: 'tasks-http-other', email: 'admin@example.com' },
      });
      const principal = await prisma.task.create({
        data: { userUuid: other.uuid, name: 'Private' },
      });

      const response = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Milk', parentUuid: principal.uuid }),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        statusCode: 404,
        message: 'Task not found.',
      });
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });
  });

  describe('GET /tasks and GET /tasks/:uuid', () => {
    it('returns a flat list of visible owned tasks including terminal subtasks', async () => {
      const other = await prisma.user.create({
        data: { googleSubject: 'tasks-http-other', email: 'admin@example.com' },
      });
      const principal = await prisma.task.create({
        data: {
          userUuid,
          name: 'Groceries',
          status: TaskStatus.IN_PROGRESS,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
      const subtask = await prisma.task.create({
        data: {
          userUuid,
          parentUuid: principal.uuid,
          name: 'Milk',
          status: TaskStatus.COMPLETED,
          createdAt: new Date('2026-10-02T00:00:00Z'),
        },
      });
      await prisma.task.createMany({
        data: [
          { userUuid, name: 'Archived', deletedAt: new Date() },
          { userUuid: other.uuid, name: 'Private' },
        ],
      });

      const response = await fetch(new URL('/tasks', baseUrl), {
        headers: { cookie },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual([
        {
          uuid: principal.uuid,
          userUuid,
          parentUuid: null,
          name: 'Groceries',
          description: null,
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          start: null,
          end: null,
          reminder: null,
        },
        {
          uuid: subtask.uuid,
          userUuid,
          parentUuid: principal.uuid,
          name: 'Milk',
          description: null,
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          start: null,
          end: null,
          reminder: null,
        },
      ]);
    });

    it('returns an empty list when there are no visible tasks', async () => {
      const response = await fetch(new URL('/tasks', baseUrl), {
        headers: { cookie },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it('returns a task by UUID with its public fields', async () => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries', status: TaskStatus.CANCELLED },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        headers: { cookie },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.CANCELLED,
        priority: TaskPriority.MEDIUM,
        start: null,
        end: null,
        reminder: null,
      });
    });
  });

  describe('Resource access', () => {
    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['PATCH', '/status'],
      ['DELETE', ''],
    ])(
      'hides another user task for %s /tasks/:uuid%s',
      async (method, suffix) => {
        const other = await prisma.user.create({
          data: {
            googleSubject: 'tasks-http-other',
            email: 'admin@example.com',
          },
        });
        const task = await prisma.task.create({
          data: { userUuid: other.uuid, name: 'Private' },
        });
        const body =
          suffix === '/status'
            ? { status: TaskStatus.IN_PROGRESS }
            : { name: 'Changed' };

        const response = await fetch(
          new URL(`/tasks/${task.uuid}${suffix}`, baseUrl),
          {
            method,
            headers: { cookie, origin, 'content-type': 'application/json' },
            ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
          },
        );

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          statusCode: 404,
          message: 'Task not found.',
        });
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(task);
      },
    );

    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['PATCH', '/status'],
      ['DELETE', ''],
    ])('validates the UUID for %s /tasks/:uuid%s', async (method, suffix) => {
      const response = await fetch(
        new URL(`/tasks/invalid${suffix}`, baseUrl),
        {
          method,
          headers: { cookie, origin, 'content-type': 'application/json' },
          ...(method === 'PATCH'
            ? {
                body: JSON.stringify(
                  suffix
                    ? { status: TaskStatus.IN_PROGRESS }
                    : { name: 'Changed' },
                ),
              }
            : {}),
        },
      );

      expect(response.status).toBe(400);
    });

    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['PATCH', '/status'],
      ['DELETE', ''],
    ])(
      'hides an archived task for %s /tasks/:uuid%s',
      async (method, suffix) => {
        const task = await prisma.task.create({
          data: { userUuid, name: 'Archived', deletedAt: new Date() },
        });

        const response = await fetch(
          new URL(`/tasks/${task.uuid}${suffix}`, baseUrl),
          {
            method,
            headers: { cookie, origin, 'content-type': 'application/json' },
            ...(method === 'PATCH'
              ? {
                  body: JSON.stringify(
                    suffix
                      ? { status: TaskStatus.IN_PROGRESS }
                      : { name: 'Changed' },
                  ),
                }
              : {}),
          },
        );

        expect(response.status).toBe(404);
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(task);
      },
    );
  });

  describe('PATCH /tasks/:uuid', () => {
    it.each([
      TaskPriority.LOW,
      TaskPriority.MEDIUM,
      TaskPriority.HIGH,
    ] as const)('persists a change to %s priority', async (priority) => {
      const task = await prisma.task.create({
        data: {
          userUuid,
          name: 'Groceries',
          priority:
            priority === TaskPriority.HIGH
              ? TaskPriority.LOW
              : TaskPriority.HIGH,
        },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ priority }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority,
        start: null,
        end: null,
        reminder: null,
      });
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }))
          .priority,
      ).toBe(priority);
    });

    it('preserves an existing high priority when omitted from a patch', async () => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries', priority: TaskPriority.HIGH },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Shopping' }),
      });

      expect(response.status).toBe(200);
      expect(((await response.json()) as TaskResponse).priority).toBe(
        TaskPriority.HIGH,
      );
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }))
          .priority,
      ).toBe(TaskPriority.HIGH);
    });

    it('accepts an empty patch without changing the public details', async () => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: null,
        end: null,
        reminder: null,
      });
    });

    it('updates supplied fields and clears nullable fields while preserving the rest', async () => {
      const task = await prisma.task.create({
        data: {
          userUuid,
          name: 'Groceries',
          description: 'For the week',
          startDate: new Date('2026-10-14T22:00:00Z'),
          reminderDate: new Date('2026-10-14T07:00:00Z'),
          reminderHasTime: true,
        },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '  Shopping  ',
          description: null,
          reminder: null,
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        uuid: task.uuid,
        userUuid,
        parentUuid: null,
        name: 'Shopping',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: { date: '2026-10-15', time: null },
        end: null,
        reminder: null,
      });
    });

    it.each([
      ['null name', { name: null }],
      ['blank name', { name: ' ' }],
      ['non-string description', { description: 1 }],
      ['null priority', { priority: null }],
      ['unknown priority', { priority: 'URGENT' }],
      ['lowercase priority', { priority: 'low' }],
      ['non-string priority', { priority: 1 }],
      ['invalid date', { start: '2026-02-30' }],
      ['changing parent', { parentUuid: null }],
      ['changing status', { status: TaskStatus.IN_PROGRESS }],
    ])('rejects %s without modifying the task', async (_label, body) => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(400);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });

    it('rejects removing the start of a scheduled task', async () => {
      const task = await prisma.task.create({
        data: {
          userUuid,
          name: 'Groceries',
          status: TaskStatus.SCHEDULED,
          startDate: new Date('2026-10-14T22:00:00Z'),
        },
      });

      const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
        method: 'PATCH',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ start: null }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        statusCode: 400,
        message: 'Scheduled tasks require a start date.',
      });
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'rejects editing %s task details',
      async (status) => {
        const task = await prisma.task.create({
          data: { userUuid, name: 'Groceries', status },
        });

        const response = await fetch(new URL(`/tasks/${task.uuid}`, baseUrl), {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Changed' }),
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          statusCode: 409,
          message: 'Completed and cancelled tasks are immutable.',
        });
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(task);
      },
    );
  });

  describe('PATCH /tasks/:uuid/status', () => {
    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'accepts the current %s status without writing',
      async (status) => {
        const task = await prisma.task.create({
          data: { userUuid, name: 'Groceries', status },
        });

        const response = await fetch(
          new URL(`/tasks/${task.uuid}/status`, baseUrl),
          {
            method: 'PATCH',
            headers: { cookie, origin, 'content-type': 'application/json' },
            body: JSON.stringify({ status }),
          },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          uuid: task.uuid,
          userUuid,
          parentUuid: null,
          name: 'Groceries',
          description: null,
          status,
          priority: TaskPriority.MEDIUM,
          start: null,
          end: null,
          reminder: null,
        });
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(task);
      },
    );

    it('changes state manually through HTTP', async () => {
      const creation = await fetch(new URL('/tasks', baseUrl), {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Groceries', start: '2026-10-15' }),
      });
      const task = (await creation.json()) as TaskResponse;
      expect(creation.status).toBe(201);

      const response = await fetch(
        new URL(`/tasks/${task.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.SCHEDULED }),
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...task,
        status: TaskStatus.SCHEDULED,
      });
    });

    it.each([
      {},
      { status: null },
      { status: 'pending' },
      { status: 'INVALID' },
      { status: TaskStatus.IN_PROGRESS, name: 'Changed' },
    ])('rejects invalid status input %j', async (body) => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });

      const response = await fetch(
        new URL(`/tasks/${task.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      expect(response.status).toBe(400);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });

    it('rejects scheduling a task without a start', async () => {
      const task = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });

      const response = await fetch(
        new URL(`/tasks/${task.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.SCHEDULED }),
        },
      );

      expect(response.status).toBe(400);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
      ).toEqual(task);
    });

    it('rejects advancing a subtask while its principal is pending', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });
      const subtask = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(
        new URL(`/tasks/${subtask.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.IN_PROGRESS }),
        },
      );

      expect(response.status).toBe(409);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: subtask.uuid } }),
      ).toEqual(subtask);
    });

    it('cancels a principal and its subtasks together', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries', status: TaskStatus.IN_PROGRESS },
      });
      const subtask = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(
        new URL(`/tasks/${principal.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.CANCELLED }),
        },
      );

      expect(response.status).toBe(200);
      expect(((await response.json()) as TaskResponse).status).toBe(
        TaskStatus.CANCELLED,
      );
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { uuid: subtask.uuid } }))
          .status,
      ).toBe(TaskStatus.CANCELLED);
    });

    it('rejects cancellation when a subtask is completed without partial changes', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries', status: TaskStatus.IN_PROGRESS },
      });
      const pending = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });
      const completed = await prisma.task.create({
        data: {
          userUuid,
          name: 'Bread',
          parentUuid: principal.uuid,
          status: TaskStatus.COMPLETED,
        },
      });

      const response = await fetch(
        new URL(`/tasks/${principal.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.CANCELLED }),
        },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        statusCode: 409,
        message: 'Tasks with completed subtasks cannot be cancelled.',
      });
      expect(
        await prisma.task.findUniqueOrThrow({
          where: { uuid: principal.uuid },
        }),
      ).toEqual(principal);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: pending.uuid } }),
      ).toEqual(pending);
      expect(
        await prisma.task.findUniqueOrThrow({
          where: { uuid: completed.uuid },
        }),
      ).toEqual(completed);
    });

    it('rejects completing a principal with unfinished subtasks', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries', status: TaskStatus.IN_PROGRESS },
      });
      const subtask = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(
        new URL(`/tasks/${principal.uuid}/status`, baseUrl),
        {
          method: 'PATCH',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: JSON.stringify({ status: TaskStatus.COMPLETED }),
        },
      );

      expect(response.status).toBe(409);
      expect(
        await prisma.task.findUniqueOrThrow({
          where: { uuid: principal.uuid },
        }),
      ).toEqual(principal);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { uuid: subtask.uuid } }),
      ).toEqual(subtask);
    });

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'does not reopen a %s task',
      async (status) => {
        const task = await prisma.task.create({
          data: { userUuid, name: 'Groceries', status },
        });

        const response = await fetch(
          new URL(`/tasks/${task.uuid}/status`, baseUrl),
          {
            method: 'PATCH',
            headers: { cookie, origin, 'content-type': 'application/json' },
            body: JSON.stringify({ status: TaskStatus.IN_PROGRESS }),
          },
        );

        expect(response.status).toBe(409);
        expect(
          await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
        ).toEqual(task);
      },
    );
  });

  describe('DELETE /tasks/:uuid', () => {
    it('hard deletes a pending principal and its subtasks', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries' },
      });
      await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(
        new URL(`/tasks/${principal.uuid}`, baseUrl),
        { method: 'DELETE', headers: { cookie, origin } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(await prisma.task.count({ where: { userUuid } })).toBe(0);
    });

    it('soft deletes a started principal and hides its subtasks from HTTP reads', async () => {
      const principal = await prisma.task.create({
        data: { userUuid, name: 'Groceries', status: TaskStatus.IN_PROGRESS },
      });
      const subtask = await prisma.task.create({
        data: { userUuid, name: 'Milk', parentUuid: principal.uuid },
      });

      const response = await fetch(
        new URL(`/tasks/${principal.uuid}`, baseUrl),
        { method: 'DELETE', headers: { cookie, origin } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      const deletedPrincipal = await prisma.task.findUniqueOrThrow({
        where: { uuid: principal.uuid },
      });
      const deletedSubtask = await prisma.task.findUniqueOrThrow({
        where: { uuid: subtask.uuid },
      });
      expect(deletedPrincipal.deletedAt).toBeInstanceOf(Date);
      expect(deletedSubtask.deletedAt).toEqual(deletedPrincipal.deletedAt);

      const list = await fetch(new URL('/tasks', baseUrl), {
        headers: { cookie },
      });
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual([]);

      const lookup = await fetch(new URL(`/tasks/${subtask.uuid}`, baseUrl), {
        headers: { cookie },
      });
      expect(lookup.status).toBe(404);
    });
  });
});
