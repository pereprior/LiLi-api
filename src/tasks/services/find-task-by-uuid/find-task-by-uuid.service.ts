import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';

@Injectable()
export class FindTaskByUuidService {
  private readonly logger = new AppLogger('FindTaskByUuidService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(
    userUuidDto: ParamUuidDto,
    uuidDto: ParamUuidDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to find task.', {
      userUuid: userUuidDto.uuid,
      taskUuid: uuidDto.uuid,
    });

    try {
      const task = await this.taskRepository.findByUuid(
        userUuidDto.uuid,
        uuidDto.uuid,
      );

      if (task === null) throw new TaskNotFoundException();

      this.logger.log('Successfully found task.', {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        status: task.status,
      });
      return task;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to find task.', {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to find task.', undefined, {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to find task.', undefined, {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
