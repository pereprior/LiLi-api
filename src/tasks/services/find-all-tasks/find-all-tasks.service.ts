import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import { DateUtils } from '#src/shared/utils/date.utils.js';
import type { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import type { FindTasksData } from '#src/tasks/types/data/find-tasks.data.js';

@Injectable()
export class FindAllTasksService {
  private readonly logger = new AppLogger('FindAllTasksService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(
    userUuidDto: ParamUuidDto,
    dto: FindTasksDto = {},
  ): Promise<TaskEntity[]> {
    this.logger.log('Starting to find tasks.', { userUuid: userUuidDto.uuid });

    try {
      const query = this.prepareFilters(dto);

      const tasks = await this.taskRepository.findAll(userUuidDto.uuid, query);

      this.logger.log('Successfully found tasks.', {
        userUuid: userUuidDto.uuid,
        count: tasks.length,
      });

      return tasks;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to find tasks.', {
            userUuid: userUuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to find tasks.', undefined, {
            userUuid: userUuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to find tasks.', undefined, {
        userUuid: userUuidDto.uuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }

  private prepareFilters(dto: FindTasksDto): FindTasksData {
    if (
      dto.view !== undefined &&
      [dto.status, dto.dateField, dto.dateFrom, dto.dateTo].some(
        (value) => value !== undefined,
      )
    ) {
      throw new TaskValidationException(
        'Task views cannot be combined with status or date filters.',
      );
    }

    if (
      dto.dateFrom !== undefined &&
      dto.dateTo !== undefined &&
      dto.dateFrom > dto.dateTo
    ) {
      throw new TaskValidationException(
        'Task date range cannot end before it starts.',
      );
    }

    const query: FindTasksData = {
      sortBy: dto.sortBy ?? 'createdAt',
      sortDirection: dto.sortDirection ?? 'asc',
    };

    if (dto.status !== undefined) query.status = dto.status;

    const search = dto.search?.trim();
    if (search) query.search = search;

    if (dto.view !== undefined) {
      const now = new Date();
      const today = DateUtils.formatLocal(now).slice(0, 10);
      const startOfDay = DateUtils.parseLocalDateTime(`${today}T00:00:00`);
      query.excludeFinished = true;
      if (dto.view === 'overdue') {
        query.overdue = { now, startOfDay };
      } else {
        query.dateField = 'start';
        query.dateFrom =
          dto.view === 'today' ? startOfDay : DateUtils.dayAfter(today, 1);
        query.dateTo = DateUtils.dayAfter(today, dto.view === 'today' ? 1 : 8);
      }
    } else if (
      dto.dateFrom !== undefined ||
      dto.dateTo !== undefined ||
      dto.dateField !== undefined
    ) {
      query.dateField = dto.dateField ?? 'start';
      if (dto.dateFrom !== undefined)
        query.dateFrom = DateUtils.parseLocalDateTime(
          `${dto.dateFrom}T00:00:00`,
        );
      if (dto.dateTo !== undefined)
        query.dateTo = DateUtils.dayAfter(dto.dateTo, 1);
    }

    return query;
  }
}
