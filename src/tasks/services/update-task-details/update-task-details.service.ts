import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { UpdateTaskDetailsDto } from '#src/tasks/dto/update-task-details.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';
import { TaskDateUtils } from '#src/tasks/utils/task-date.utils.js';

@Injectable()
export class UpdateTaskDetailsService {
  private readonly logger = new AppLogger('UpdateTaskDetailsService');

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly findTaskByUuid: FindTaskByUuidService,
  ) {}

  async execute(
    userUuidDto: ParamUuidDto,
    uuidDto: ParamUuidDto,
    dto: UpdateTaskDetailsDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to update task details.', {
      userUuid: userUuidDto.uuid,
      taskUuid: uuidDto.uuid,
      fields: Object.keys(dto),
    });

    try {
      const task = await this.findTaskByUuid.execute(userUuidDto, uuidDto);
      const data: UpdateTaskData = {};

      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.start !== undefined)
        data.start = TaskDateMapper.fromString(dto.start);
      if (dto.end !== undefined) data.end = TaskDateMapper.fromString(dto.end);
      if (dto.reminder !== undefined)
        data.reminder = TaskDateMapper.fromString(dto.reminder);

      TaskDateUtils.validateDateRange(
        data.start === undefined ? task.start : data.start,
        data.end === undefined ? task.end : data.end,
      );

      const updated = await this.taskRepository.update(
        userUuidDto.uuid,
        uuidDto.uuid,
        data,
      );

      this.logger.log('Successfully updated task details.', {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        fields: Object.keys(data),
      });
      return updated;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to update task details.', {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            fields: Object.keys(dto),
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to update task details.', undefined, {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            fields: Object.keys(dto),
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to update task details.', undefined, {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        fields: Object.keys(dto),
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
