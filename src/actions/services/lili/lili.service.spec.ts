import { Test, type TestingModule } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import { ActionValidationError } from '#src/actions/errors/action-validation.error.js';
import { UnknownActionError } from '#src/actions/errors/unknown-action.error.js';
import { ActionResponse } from '#src/actions/responses/action.response.js';
import { LiliService } from '#src/actions/services/lili/lili.service.js';
import {
  ACTION_HANDLERS,
  type ActionRequest,
} from '#src/actions/types/action-contracts.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('LiliService', () => {
  let module: TestingModule;
  let lili: LiliService;
  const execute =
    vi.fn<
      (actor: ParamUuidDto, payload: CreateTaskDto) => Promise<TaskEntity>
    >();
  const findAll =
    vi.fn<
      (actor: ParamUuidDto, payload: FindTasksDto) => Promise<TaskEntity[]>
    >();
  const actor = { uuid: 'ff418d72-fc63-41a9-8113-5f78cf44a6b4' };

  beforeEach(async () => {
    execute.mockReset();
    findAll.mockReset();
    module = await Test.createTestingModule({
      providers: [
        LiliService,
        {
          provide: ACTION_HANDLERS,
          useValue: {
            'tasks.create': { payloadType: CreateTaskDto, execute },
            'tasks.findAll': { payloadType: FindTasksDto, execute: findAll },
          },
        },
      ],
    }).compile();
    lili = module.get(LiliService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Dispatch', () => {
    it('passes validated actor and payload instances to the handler', async () => {
      await lili.execute({
        actor,
        action: 'tasks.create',
        payload: { name: 'Groceries' },
      });

      expect(execute).toHaveBeenCalledExactlyOnceWith(actor, {
        name: 'Groceries',
      });
      expect(execute.mock.calls[0]?.[0]).toBeInstanceOf(ParamUuidDto);
      expect(execute.mock.calls[0]?.[1]).toBeInstanceOf(CreateTaskDto);
    });

    it('awaits the handler and returns the action with its typed result', async () => {
      const pending = Promise.withResolvers<TaskEntity>();
      execute.mockReturnValue(pending.promise);
      const settled = vi.fn();
      const result = lili.execute({
        actor,
        action: 'tasks.create',
        payload: { name: 'Groceries' },
      });
      void result.then(settled);
      expectTypeOf(result).toEqualTypeOf<
        Promise<ActionResponse<'tasks.create'>>
      >();
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      expect(settled).not.toHaveBeenCalled();

      const task = new TaskEntity(
        'created-task',
        actor.uuid,
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
      pending.resolve(task);

      const response = await result;

      expect(response).toEqual(new ActionResponse('tasks.create', task));
      expect(response).toBeInstanceOf(ActionResponse);
      expect(response.result).toBe(task);
      expectTypeOf(response.result).toEqualTypeOf<TaskEntity>();
    });

    it('preserves the handler exception', async () => {
      const error = new TaskConflictException('Task cannot be modified.');
      execute.mockRejectedValue(error);

      await expect(
        lili.execute({
          actor,
          action: 'tasks.create',
          payload: { name: 'Groceries' },
        }),
      ).rejects.toBe(error);
    });

    it.each(['tasks.unknown', 'toString', '__proto__'])(
      'rejects unregistered action %s without executing a handler',
      async (action) => {
        const request = {
          actor,
          action,
          payload: { name: 'Groceries' },
        } as ActionRequest<'tasks.create'>;

        await expect(lili.execute(request)).rejects.toThrow(
          new UnknownActionError(),
        );
        expect(execute).not.toHaveBeenCalled();
      },
    );
  });

  describe('Task list validation', () => {
    it.each([
      'status',
      'search',
      'dateField',
      'dateFrom',
      'dateTo',
      'sortBy',
      'sortDirection',
      'view',
    ])('rejects null %s before invoking the handler', async (field) => {
      const request = {
        actor,
        action: 'tasks.findAll',
        payload: { [field]: null },
      } as ActionRequest<'tasks.findAll'>;

      await expect(lili.execute(request)).rejects.toBeInstanceOf(
        ActionValidationError,
      );
      expect(findAll).not.toHaveBeenCalled();
    });

    it('accepts omitted filters', async () => {
      findAll.mockResolvedValue([]);

      const response = await lili.execute({
        actor,
        action: 'tasks.findAll',
        payload: {},
      });

      expect(findAll).toHaveBeenCalledExactlyOnceWith(actor, {});
      expect(response).toEqual(new ActionResponse('tasks.findAll', []));
    });

    it('accepts explicitly undefined filters', async () => {
      findAll.mockResolvedValue([]);
      const payload = Object.assign(new FindTasksDto(), {
        status: undefined,
        search: undefined,
        dateField: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        sortBy: undefined,
        sortDirection: undefined,
        view: undefined,
      });

      const response = await lili.execute({
        actor,
        action: 'tasks.findAll',
        payload,
      });

      expect(findAll).toHaveBeenCalledExactlyOnceWith(actor, payload);
      expect(response).toEqual(new ActionResponse('tasks.findAll', []));
    });
  });

  describe('Input validation', () => {
    it.each([
      { uuid: 'invalid-uuid' },
      { uuid: actor.uuid, role: 'admin' },
      null,
      undefined,
      [],
      'owner',
    ])(
      'rejects invalid actor %j before invoking the handler',
      async (input) => {
        const request = {
          actor: input,
          action: 'tasks.create',
          payload: { name: 'Groceries' },
        } as ActionRequest<'tasks.create'>;

        await expect(lili.execute(request)).rejects.toBeInstanceOf(
          ActionValidationError,
        );
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it.each([
      {},
      { name: '  ' },
      { name: 'Groceries', userUuid: actor.uuid },
      { name: 'Groceries', priority: null },
      { name: 'Groceries', reminder: 'invalid-date' },
      null,
      undefined,
      [],
      'Groceries',
    ])(
      'rejects invalid payload %j before invoking the handler',
      async (payload) => {
        const request = {
          actor,
          action: 'tasks.create',
          payload,
        } as ActionRequest<'tasks.create'>;

        await expect(lili.execute(request)).rejects.toBeInstanceOf(
          ActionValidationError,
        );
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('returns validation messages without including the input value', async () => {
      const result = lili.execute({
        actor,
        action: 'tasks.create',
        payload: { name: 'Groceries', parentUuid: 'private-input' },
      });

      await expect(result).rejects.toMatchObject({
        messages: ['parentUuid must be a UUID'],
      });
    });
  });
});
