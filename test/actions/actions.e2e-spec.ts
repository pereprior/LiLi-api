import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ActionsModule } from '#src/actions/actions.module.js';
import { ActionValidationError } from '#src/actions/errors/action-validation.error.js';
import { LiliService } from '#src/actions/services/lili/lili.service.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('Actions without HTTP', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let lili: LiliService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ActionsModule,
      ],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    lili = module.get(LiliService);
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'actions-e2e-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'actions-e2e-' } },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { user: { googleSubject: { startsWith: 'actions-e2e-' } } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: { startsWith: 'actions-e2e-' } },
    });
    await module.close();
  });

  it('runs the task lifecycle through the common executor', async () => {
    const user = await prisma.user.create({
      data: { googleSubject: 'actions-e2e-owner', email: 'owner@example.com' },
    });
    const actor = { uuid: user.uuid };

    const { result: created } = await lili.execute({
      actor,
      action: 'tasks.create',
      payload: { name: '  Groceries  ' },
    });
    expect(created.name).toBe('Groceries');
    expect(created.userUuid).toBe(user.uuid);

    const { result: found } = await lili.execute({
      actor,
      action: 'tasks.findByUuid',
      payload: { uuid: created.uuid },
    });
    expect(found).toEqual(created);

    const { result: updated } = await lili.execute({
      actor,
      action: 'tasks.updateDetails',
      payload: { uuid: created.uuid, description: 'Buy milk' },
    });
    expect(updated.description).toBe('Buy milk');

    const { result: started } = await lili.execute({
      actor,
      action: 'tasks.updateStatus',
      payload: { uuid: created.uuid, status: TaskStatus.IN_PROGRESS },
    });
    expect(started.status).toBe(TaskStatus.IN_PROGRESS);

    const { result: listed } = await lili.execute({
      actor,
      action: 'tasks.findAll',
      payload: { status: [TaskStatus.IN_PROGRESS] },
    });
    expect(listed).toEqual([started]);

    const { result: deleted } = await lili.execute({
      actor,
      action: 'tasks.delete',
      payload: { uuid: created.uuid },
    });
    expect(deleted).toEqual({ success: true });
    const stored = await prisma.task.findUniqueOrThrow({
      where: { uuid: created.uuid },
    });
    expect(stored.deletedAt).toBeInstanceOf(Date);
    const response = await lili.execute({
      actor,
      action: 'tasks.findAll',
      payload: {},
    });
    expect(response).toEqual({ action: 'tasks.findAll', result: [] });
  });

  it('prevents the acting user from modifying another user’s task', async () => {
    const owner = await prisma.user.create({
      data: { googleSubject: 'actions-e2e-owner', email: 'owner@example.com' },
    });
    const other = await prisma.user.create({
      data: { googleSubject: 'actions-e2e-other', email: 'other@example.com' },
    });
    const { result: task } = await lili.execute({
      actor: { uuid: owner.uuid },
      action: 'tasks.create',
      payload: { name: 'Private task' },
    });

    const result = lili.execute({
      actor: { uuid: other.uuid },
      action: 'tasks.updateDetails',
      payload: { uuid: task.uuid, name: 'Changed' },
    });

    await expect(result).rejects.toBeInstanceOf(TaskNotFoundException);
    expect(
      await prisma.task.findUniqueOrThrow({ where: { uuid: task.uuid } }),
    ).toMatchObject({ name: 'Private task' });
  });

  it('validates non-HTTP payloads before persisting a task', async () => {
    const user = await prisma.user.create({
      data: { googleSubject: 'actions-e2e-owner', email: 'owner@example.com' },
    });

    await expect(
      lili.execute({
        actor: { uuid: user.uuid },
        action: 'tasks.create',
        payload: { name: '  ' },
      }),
    ).rejects.toBeInstanceOf(ActionValidationError);
    expect(await prisma.task.count({ where: { userUuid: user.uuid } })).toBe(0);
  });

  it('applies domain rules through the common executor', async () => {
    const user = await prisma.user.create({
      data: { googleSubject: 'actions-e2e-owner', email: 'owner@example.com' },
    });

    const result = lili.execute({
      actor: { uuid: user.uuid },
      action: 'tasks.create',
      payload: { name: 'Groceries', start: '2026-10-15', end: '2026-10-14' },
    });

    await expect(result).rejects.toBeInstanceOf(TaskValidationException);
    expect(await prisma.task.count({ where: { userUuid: user.uuid } })).toBe(0);
  });
});
