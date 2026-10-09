import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';

@Injectable()
export class FindAllTasksService {
  private readonly logger = new AppLogger('FindAllTasksService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(userUuidDto: ParamUuidDto): Promise<TaskEntity[]> {
    this.logger.log('Starting to find tasks.', { userUuid: userUuidDto.uuid });

    try {
      const tasks = await this.taskRepository.findAll(userUuidDto.uuid);

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
}
