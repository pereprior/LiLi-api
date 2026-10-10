import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('CreateTaskService', () => {
  let module: TestingModule;
  let service: CreateTaskService;
  const create = vi.fn<TaskRepository['create']>();
  const findTaskByUuid = vi.fn<TaskRepository['findByUuid']>();

  beforeEach(async () => {
    create.mockReset();
    findTaskByUuid.mockReset();
    module = await Test.createTestingModule({
      providers: [
        CreateTaskService,
        {
          provide: TaskRepository,
          useValue: {
            findByUuid: findTaskByUuid,
            create,
            transaction: <T>(
              operation: (repository: TaskRepository) => Promise<T>,
            ): Promise<T> => operation(module.get(TaskRepository)),
          },
        },
      ],
    }).compile();
    service = module.get(CreateTaskService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Task creation', () => {
    it('uses the acting user, trims the name and starts a task as pending', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        null,
        null,
        null,
        null,
      );
      create.mockResolvedValue(task);

      await service.execute({ uuid: 'user-1' }, { name: '  Groceries  ' });

      expect(create).toHaveBeenCalledExactlyOnceWith({
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: null,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: null,
        end: null,
        reminder: null,
      });
      expect(findTaskByUuid).not.toHaveBeenCalled();
    });

    it.each([
      TaskPriority.LOW,
      TaskPriority.MEDIUM,
      TaskPriority.HIGH,
    ] as const)(
      'passes an explicit %s priority to persistence',
      async (priority) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Groceries',
          null,
          TaskStatus.PENDING,
          priority,
          null,
          null,
          null,
          null,
        );
        create.mockResolvedValue(task);

        await service.execute(
          { uuid: 'user-1' },
          { name: 'Groceries', priority },
        );

        expect(create).toHaveBeenCalledExactlyOnceWith({
          userUuid: 'user-1',
          parentUuid: null,
          name: 'Groceries',
          description: null,
          status: TaskStatus.PENDING,
          priority,
          start: null,
          end: null,
          reminder: null,
        });
      },
    );

    it('returns the entity supplied by persistence', async () => {
      const task = new TaskEntity(
        'saved-uuid',
        'user-1',
        null,
        'Groceries',
        null,
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        null,
        null,
        null,
        null,
      );
      create.mockResolvedValue(task);

      const created = await service.execute(
        { uuid: 'user-1' },
        { name: 'Groceries' },
      );

      expect(created).toBe(task);
    });

    it('passes optional details and dates to persistence', async () => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Groceries',
        'Buy vegetables',
        TaskStatus.PENDING,
        TaskPriority.MEDIUM,
        new TaskDateEntity('2026-07-10'),
        new TaskDateEntity('2026-07-11', '00:00'),
        new TaskDateEntity('2026-07-09', '06:00'),
        null,
      );
      create.mockResolvedValue(task);

      await service.execute(
        { uuid: 'user-1' },
        {
          name: 'Groceries',
          description: 'Buy vegetables',
          start: '2026-07-10',
          end: '2026-07-11T00:00',
          reminder: '2026-07-09T06:00',
        },
      );

      expect(create).toHaveBeenCalledExactlyOnceWith({
        userUuid: 'user-1',
        parentUuid: null,
        name: 'Groceries',
        description: 'Buy vegetables',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        start: new TaskDateEntity('2026-07-10'),
        end: new TaskDateEntity('2026-07-11', '00:00'),
        reminder: new TaskDateEntity('2026-07-09', '06:00'),
      });
    });
  });

  describe('Date rules', () => {
    it.each([
      { start: '2026-07-11', end: '2026-07-10' },
      { start: '2026-07-10T18:30', end: '2026-07-10T18:00' },
    ])('rejects an end preceding the start: %j', async (dates) => {
      const result = service.execute(
        { uuid: 'user-1' },
        { name: 'Groceries', ...dates },
      );

      await expect(result).rejects.toThrow(
        new TaskValidationException('Task end cannot precede its start.'),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      { start: '2026-07-10T18:30', end: '2026-07-10' },
      { start: '2026-07-10', end: '2026-07-10T18:30' },
      { start: '2026-07-10T18:30', end: '2026-07-10T18:30' },
      { end: '2026-07-10' },
      { reminder: '2026-07-10T06:00' },
    ])(
      'allows optional dates without requiring both bounds: %j',
      async (dates) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Groceries',
          null,
          TaskStatus.PENDING,
          TaskPriority.MEDIUM,
          null,
          null,
          null,
          null,
        );
        create.mockResolvedValue(task);

        await service.execute(
          { uuid: 'user-1' },
          { name: 'Groceries', ...dates },
        );

        expect(create).toHaveBeenCalledOnce();
      },
    );
  });

  describe('Subtask creation', () => {
    it.each([
      TaskStatus.PENDING,
      TaskStatus.SCHEDULED,
      TaskStatus.IN_PROGRESS,
      TaskStatus.PAUSED,
      TaskStatus.BLOCKED,
    ] as const)(
      'creates a pending subtask under a %s principal',
      async (status) => {
        const parentUuid = '00000000-0000-4000-8000-000000000001';
        const parent = new TaskEntity(
          parentUuid,
          'user-1',
          null,
          'Dinner',
          null,
          status,
          TaskPriority.MEDIUM,
          new TaskDateEntity('2026-07-10'),
          null,
          null,
          null,
        );
        findTaskByUuid.mockResolvedValue(parent);
        const subtask = new TaskEntity(
          'subtask-1',
          'user-1',
          parentUuid,
          'Groceries',
          null,
          TaskStatus.PENDING,
          TaskPriority.MEDIUM,
          null,
          null,
          null,
          null,
        );
        create.mockResolvedValue(subtask);

        await service.execute(
          { uuid: 'user-1' },
          { name: 'Groceries', parentUuid },
        );

        expect(findTaskByUuid).toHaveBeenCalledExactlyOnceWith(
          'user-1',
          parentUuid,
        );
        expect(create).toHaveBeenCalledExactlyOnceWith({
          userUuid: 'user-1',
          parentUuid,
          name: 'Groceries',
          description: null,
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          start: null,
          end: null,
          reminder: null,
        });
      },
    );

    it('rejects a principal that is not visible to the acting user', async () => {
      const parentUuid = '00000000-0000-4000-8000-000000000001';
      findTaskByUuid.mockRejectedValue(new TaskNotFoundException());

      const result = service.execute(
        { uuid: 'user-1' },
        {
          name: 'Groceries',
          parentUuid,
        },
      );

      await expect(result).rejects.toThrow(new TaskNotFoundException());
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a second level of subtasks', async () => {
      const parentUuid = '00000000-0000-4000-8000-000000000001';
      findTaskByUuid.mockResolvedValue(
        new TaskEntity(
          parentUuid,
          'user-1',
          'principal-uuid',
          'Dinner',
          null,
          TaskStatus.PENDING,
          TaskPriority.MEDIUM,
          null,
          null,
          null,
          null,
        ),
      );

      const result = service.execute(
        { uuid: 'user-1' },
        {
          name: 'Groceries',
          parentUuid,
        },
      );

      await expect(result).rejects.toThrow(
        new TaskConflictException('Subtasks cannot have their own subtasks.'),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const)(
      'rejects adding a subtask to a %s principal',
      async (status) => {
        const parentUuid = '00000000-0000-4000-8000-000000000001';
        findTaskByUuid.mockResolvedValue(
          new TaskEntity(
            parentUuid,
            'user-1',
            null,
            'Dinner',
            null,
            status,
            TaskPriority.MEDIUM,
            null,
            null,
            null,
            null,
          ),
        );

        const result = service.execute(
          { uuid: 'user-1' },
          {
            name: 'Groceries',
            parentUuid,
          },
        );

        await expect(result).rejects.toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks cannot receive new subtasks.',
          ),
        );
        expect(create).not.toHaveBeenCalled();
      },
    );
  });

  describe('Persistence failures', () => {
    it('preserves a domain error raised by persistence', async () => {
      const error = new TaskValidationException('Invalid task date.');
      create.mockRejectedValue(error);

      await expect(
        service.execute({ uuid: 'user-1' }, { name: 'Groceries' }),
      ).rejects.toBe(error);
    });

    it('hides unexpected persistence details', async () => {
      create.mockRejectedValue(new Error('private database details'));

      await expect(
        service.execute({ uuid: 'user-1' }, { name: 'Groceries' }),
      ).rejects.toThrow(new TaskException());
    });

    it('hides unexpected principal lookup failures without creating a subtask', async () => {
      findTaskByUuid.mockRejectedValue(new Error('private database details'));

      const result = service.execute(
        { uuid: 'user-1' },
        {
          name: 'Groceries',
          parentUuid: '00000000-0000-4000-8000-000000000001',
        },
      );

      await expect(result).rejects.toThrow(new TaskException());
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('Missing records', () => {
    it('rejects a missing parent without modifying persistence', async () => {
      findTaskByUuid.mockResolvedValue(null);

      await expect(
        service.execute(
          { uuid: 'user-1' },
          { name: 'Groceries', parentUuid: 'parent-1' },
        ),
      ).rejects.toThrow(new TaskNotFoundException());

      expect(create).not.toHaveBeenCalled();
    });
  });
});
