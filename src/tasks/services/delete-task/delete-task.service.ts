import { Injectable } from '@nestjs/common';

import { AppLogger } from '#src/logging/app-logger.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

@Injectable()
export class DeleteTaskService {
  private readonly logger = new AppLogger('DeleteTaskService');

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly findTaskByUuid: FindTaskByUuidService,
  ) {}

  async execute(userUuid: string, uuid: string): Promise<void> {
    this.logger.log('Starting to delete task.', { userUuid, taskUuid: uuid });

    try {
      await this.findTaskByUuid.execute(userUuid, uuid);

      await this.taskRepository.delete(userUuid, uuid);

      this.logger.log('Successfully deleted task.', {
        userUuid,
        taskUuid: uuid,
      });
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to delete task.', {
            userUuid,
            taskUuid: uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to delete task.', undefined, {
            userUuid,
            taskUuid: uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to delete task.', undefined, {
        userUuid,
        taskUuid: uuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
