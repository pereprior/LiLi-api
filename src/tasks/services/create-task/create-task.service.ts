import { Injectable } from '@nestjs/common';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';
import type { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';
import { TaskDateUtils } from '#src/tasks/utils/task-date.utils.js';

@Injectable()
export class CreateTaskService {
  private readonly logger = new AppLogger('CreateTaskService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(
    userUuidDto: ParamUuidDto,
    dto: CreateTaskDto,
  ): Promise<TaskEntity> {
    this.logger.log('Starting to create task.', {
      userUuid: userUuidDto.uuid,
      parentUuid: dto.parentUuid ?? null,
    });

    try {
      const task = await this.taskRepository.transaction(async (repository) => {
        const start = TaskDateMapper.fromString(dto.start ?? null);
        const end = TaskDateMapper.fromString(dto.end ?? null);
        const reminder = TaskDateMapper.fromString(dto.reminder ?? null);

        TaskDateUtils.validateDateRange(start, end);

        if (dto.parentUuid !== undefined && dto.parentUuid !== null) {
          const parent = await repository.findByUuid(
            userUuidDto.uuid,
            dto.parentUuid,
          );

          if (parent === null) throw new TaskNotFoundException();

          if (parent.parentUuid !== null) {
            throw new TaskConflictException(
              'Subtasks cannot have their own subtasks.',
            );
          }

          if (
            parent.status === TaskStatus.COMPLETED ||
            parent.status === TaskStatus.CANCELLED
          ) {
            throw new TaskConflictException(
              'Completed and cancelled tasks cannot receive new subtasks.',
            );
          }
        }

        const task = await repository.create({
          userUuid: userUuidDto.uuid,
          parentUuid: dto.parentUuid ?? null,
          name: dto.name.trim(),
          description: dto.description ?? null,
          status: TaskStatus.PENDING,
          priority: dto.priority ?? TaskPriority.MEDIUM,
          start,
          end,
          reminder,
        });

        return task;
      });

      this.logger.log('Successfully created task.', {
        userUuid: userUuidDto.uuid,
        taskUuid: task.uuid,
        parentUuid: task.parentUuid,
        status: task.status,
      });
      return task;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to create task.', {
            userUuid: userUuidDto.uuid,
            parentUuid: dto.parentUuid ?? null,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to create task.', undefined, {
            userUuid: userUuidDto.uuid,
            parentUuid: dto.parentUuid ?? null,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to create task.', undefined, {
        userUuid: userUuidDto.uuid,
        parentUuid: dto.parentUuid ?? null,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }
}
