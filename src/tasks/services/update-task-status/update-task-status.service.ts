import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { UpdateTaskStatusDto } from '#src/tasks/dto/update-task-status.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';
import { TaskStateRulesUtils } from '#src/tasks/utils/task-state-rules.utils.js';

@Injectable()
export class UpdateTaskStatusService {
  private readonly logger = new AppLogger('UpdateTaskStatusService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(
    userUuidDto: ParamUuidDto,
    uuidDto: ParamUuidDto,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to update task status.', {
      userUuid: userUuidDto.uuid,
      taskUuid: uuidDto.uuid,
      status: dto.status,
    });

    try {
      const result = await this.taskRepository.transaction(
        async (repository) => {
          const task = await repository.findByUuid(
            userUuidDto.uuid,
            uuidDto.uuid,
          );

          if (task === null) throw new TaskNotFoundException();
          if (dto.status === task.status)
            return { task, previousStatus: task.status };

          TaskStateRulesUtils.assertEditable(task);
          TaskStateRulesUtils.validateScheduledStart(dto.status, task.start);

          if (task.parentUuid !== null) {
            const parent = await repository.findByUuid(
              userUuidDto.uuid,
              task.parentUuid,
            );

            if (parent === null) throw new TaskNotFoundException();

            TaskStateRulesUtils.validateSubtaskStatus(
              parent.status,
              dto.status,
            );
          } else {
            const subtasks = await repository.findSubtasks(
              userUuidDto.uuid,
              task.uuid,
            );

            if (dto.status === TaskStatus.CANCELLED) {
              if (
                subtasks.some(
                  (subtask) => subtask.status === TaskStatus.COMPLETED,
                )
              ) {
                throw new TaskConflictException(
                  'Tasks with completed subtasks cannot be cancelled.',
                );
              }
              for (const subtask of subtasks) {
                if (subtask.status !== TaskStatus.CANCELLED) {
                  await repository.update(userUuidDto.uuid, subtask.uuid, {
                    status: TaskStatus.CANCELLED,
                  });
                }
              }
            } else {
              for (const subtask of subtasks) {
                TaskStateRulesUtils.validateSubtaskStatus(
                  dto.status,
                  subtask.status,
                );
              }
            }
          }

          const updated = await repository.update(
            userUuidDto.uuid,
            uuidDto.uuid,
            {
              status: dto.status,
            },
          );

          return { task: updated, previousStatus: task.status };
        },
      );

      this.logger.log('Successfully updated task status.', {
        userUuid: userUuidDto.uuid,
        taskUuid: uuidDto.uuid,
        previousStatus: result.previousStatus,
        status: result.task.status,
      });

      return result.task;
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
