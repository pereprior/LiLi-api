import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('FindAllTasksService', () => {
  let module: TestingModule;
  let service: FindAllTasksService;
  const findAll = vi.fn<TaskRepository['findAll']>();

  beforeEach(async () => {
    findAll.mockReset();
    module = await Test.createTestingModule({
      providers: [
        FindAllTasksService,
        { provide: TaskRepository, useValue: { findAll } },
      ],
    }).compile();
    service = module.get(FindAllTasksService);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await module.close();
  });

  describe('Visible tasks', () => {
    it('returns the acting user tasks in repository order', async () => {
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
      const tasks = [task];
      findAll.mockResolvedValue(tasks);

      const result = await service.execute({ uuid: 'user-1' });

      expect(result).toBe(tasks);
      expect(findAll).toHaveBeenCalledExactlyOnceWith('user-1', {
        sortBy: 'createdAt',
        sortDirection: 'asc',
      });
    });

    it('returns an empty list when no tasks are visible', async () => {
      findAll.mockResolvedValue([]);

      expect(await service.execute({ uuid: 'user-1' })).toEqual([]);
    });
  });

  describe('List filters', () => {
    it('passes combined filters with inclusive Madrid calendar dates', async () => {
      findAll.mockResolvedValue([]);

      await service.execute(
        { uuid: 'user-1' },
        {
          status: [TaskStatus.PENDING, TaskStatus.SCHEDULED],
          search: '  planif  ',
          dateField: 'end',
          dateFrom: '2026-10-25',
          dateTo: '2026-10-25',
          sortBy: 'priority',
          sortDirection: 'desc',
        },
      );

      expect(findAll).toHaveBeenCalledExactlyOnceWith('user-1', {
        status: [TaskStatus.PENDING, TaskStatus.SCHEDULED],
        search: 'planif',
        dateField: 'end',
        dateFrom: new Date('2026-10-24T22:00:00Z'),
        dateTo: new Date('2026-10-25T23:00:00Z'),
        sortBy: 'priority',
        sortDirection: 'desc',
      });
    });

    it.each([{ dateFrom: '2026-10-10' }, { dateTo: '2026-10-10' }])(
      'defaults date ranges to the start field for %j',
      async (dto) => {
        findAll.mockResolvedValue([]);

        await service.execute({ uuid: 'user-1' }, dto);

        expect(findAll).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ dateField: 'start' }),
        );
      },
    );

    it('ignores a blank search', async () => {
      findAll.mockResolvedValue([]);

      await service.execute({ uuid: 'user-1' }, { search: '   ' });

      expect(findAll).toHaveBeenCalledWith('user-1', {
        sortBy: 'createdAt',
        sortDirection: 'asc',
      });
    });

    it.each([
      { view: 'today', status: [TaskStatus.PENDING] },
      { view: 'upcoming', dateFrom: '2026-10-10' },
      { view: 'overdue', dateTo: '2026-10-10' },
      { view: 'today', dateField: 'start' },
    ] satisfies FindTasksDto[])(
      'rejects conflicting view filters %j before querying',
      async (dto) => {
        await expect(service.execute({ uuid: 'user-1' }, dto)).rejects.toThrow(
          new TaskValidationException(
            'Task views cannot be combined with status or date filters.',
          ),
        );
        expect(findAll).not.toHaveBeenCalled();
      },
    );

    it('rejects a reversed range before querying', async () => {
      await expect(
        service.execute(
          { uuid: 'user-1' },
          { dateFrom: '2026-10-11', dateTo: '2026-10-10' },
        ),
      ).rejects.toThrow(
        new TaskValidationException(
          'Task date range cannot end before it starts.',
        ),
      );
      expect(findAll).not.toHaveBeenCalled();
    });
  });

  describe('Relative views', () => {
    it.each([
      [
        'spring DST',
        '2026-03-29T12:00:00Z',
        '2026-03-28T23:00:00Z',
        '2026-03-29T22:00:00Z',
      ],
      [
        'autumn DST',
        '2026-10-25T12:00:00Z',
        '2026-10-24T22:00:00Z',
        '2026-10-25T23:00:00Z',
      ],
      [
        'Madrid day ahead of UTC',
        '2026-10-09T22:30:00Z',
        '2026-10-09T22:00:00Z',
        '2026-10-10T22:00:00Z',
      ],
    ])('selects the Madrid day across %s', async (_label, now, from, to) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(now));
      findAll.mockResolvedValue([]);

      await service.execute(
        { uuid: 'user-1' },
        { view: 'today', search: 'planif', sortBy: 'start' },
      );

      expect(findAll).toHaveBeenCalledExactlyOnceWith('user-1', {
        search: 'planif',
        sortBy: 'start',
        sortDirection: 'asc',
        excludeFinished: true,
        dateField: 'start',
        dateFrom: new Date(from),
        dateTo: new Date(to),
      });
    });

    it('selects tomorrow through the seventh following day across DST', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
      findAll.mockResolvedValue([]);

      await service.execute({ uuid: 'user-1' }, { view: 'upcoming' });

      expect(findAll).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          excludeFinished: true,
          dateField: 'start',
          dateFrom: new Date('2026-10-24T22:00:00Z'),
          dateTo: new Date('2026-10-31T23:00:00Z'),
        }),
      );
    });

    it('uses the instant for timed deadlines and midnight for date-only deadlines', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
      findAll.mockResolvedValue([]);

      await service.execute({ uuid: 'user-1' }, { view: 'overdue' });

      expect(findAll).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          excludeFinished: true,
          overdue: {
            now: new Date('2026-10-10T12:00:00Z'),
            startOfDay: new Date('2026-10-09T22:00:00Z'),
          },
        }),
      );
    });
  });

  it('preserves domain errors', async () => {
    const error = new TaskNotFoundException();
    findAll.mockRejectedValue(error);

    await expect(service.execute({ uuid: 'user-1' })).rejects.toBe(error);
  });

  it('hides unexpected persistence details', async () => {
    const error = new Error('private database details');
    findAll.mockRejectedValue(error);

    await expect(service.execute({ uuid: 'user-1' })).rejects.toThrow(
      new TaskException(),
    );
  });
});
