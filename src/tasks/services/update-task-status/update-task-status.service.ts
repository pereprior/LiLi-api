import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { ChangeTaskStatusDto } from '#src/tasks/dto/change-task-status.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

@Injectable()
export class UpdateTaskStatusService {
  private readonly logger = new AppLogger('UpdateTaskStatusService');

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly findTaskByUuid: FindTaskByUuidService,
  ) {}

  async execute(
    userUuidDto: ParamUuidDto,
    uuidDto: ParamUuidDto,
    dto: ChangeTaskStatusDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to update task status.', {
      userUuid: userUuidDto.uuid,
      taskUuid: uuidDto.uuid,
      status: dto.status,
    });

    try {
      const task = await this.findTaskByUuid.execute(userUuidDto, uuidDto);

      const updated = await this.taskRepository.update(
        userUuidDto.uuid,
        uuidDto.uuid,
        {
          status: dto.status,
        },
      );

      this.logger.log('Successfully updated task status.', {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        previousStatus: task.status,
        status: updated.status,
      });
      return updated;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to update task status.', {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            status: dto.status,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to update task status.', undefined, {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            status: dto.status,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to update task status.', undefined, {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        status: dto.status,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
