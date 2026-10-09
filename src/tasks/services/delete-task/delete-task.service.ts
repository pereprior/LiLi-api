import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import { DeleteResponse } from '#src/shared/responses/delete.response.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';

@Injectable()
export class DeleteTaskService {
  private readonly logger = new AppLogger('DeleteTaskService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(
    userUuidDto: ParamUuidDto,
    uuidDto: ParamUuidDto,
  ): Promise<DeleteResponse> {
    this.logger.log('Starting to delete task.', {
      userUuid: userUuidDto.uuid,
      taskUuid: uuidDto.uuid,
    });

    try {
      await this.taskRepository.transaction(async (repository) => {
        const task = await repository.findByUuid(
          userUuidDto.uuid,
          uuidDto.uuid,
        );

        if (task === null) throw new TaskNotFoundException();

        if (task.status === 'PENDING') {
          await repository.delete(userUuidDto.uuid, uuidDto.uuid);
        } else {
          await repository.softDelete(userUuidDto.uuid, uuidDto.uuid);
        }
      });

      this.logger.log('Successfully deleted task.', {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
      });
      return new DeleteResponse(true);
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to delete task.', {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to delete task.', undefined, {
            userUuid: userUuidDto.uuid,
            taskUuid: uuidDto.uuid,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to delete task.', undefined, {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
