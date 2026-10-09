import { Injectable } from '@nestjs/common';

import { AppLogger } from '#src/logging/app-logger.js';
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
    userUuid: string,
    uuid: string,
    dto: ChangeTaskStatusDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to update task status.', {
      userUuid,
      taskUuid: uuid,
      status: dto.status,
    });

    try {
      const task = await this.findTaskByUuid.execute(userUuid, uuid);

      const updated = await this.taskRepository.update(userUuid, uuid, {
        status: dto.status,
      });

      this.logger.log('Successfully updated task status.', {
        userUuid,
        taskUuid: uuid,
        previousStatus: task.status,
        status: updated.status,
      });
      return updated;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to update task status.', {
            userUuid,
            taskUuid: uuid,
            status: dto.status,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to update task status.', undefined, {
            userUuid,
            taskUuid: uuid,
            status: dto.status,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to update task status.', undefined, {
        userUuid,
        taskUuid: uuid,
        status: dto.status,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
