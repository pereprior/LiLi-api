import { Injectable } from '@nestjs/common';

import { AppLogger } from '#src/logging/app-logger.js';
import type { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { TaskDateUtils } from '#src/tasks/utils/task-date.utils.js';

@Injectable()
export class CreateTaskService {
  private readonly logger = new AppLogger('CreateTaskService');

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly findTaskByUuid: FindTaskByUuidService,
  ) {}

  async execute(userUuid: string, dto: CreateTaskDto): Promise<TaskEntity> {
    this.logger.log('Starting to create task.', {
      userUuid,
      parentUuid: dto.parentUuid ?? null,
    });

    try {
      const start = TaskDateMapper.fromString(dto.start ?? null);
      const end = TaskDateMapper.fromString(dto.end ?? null);
      const reminder = TaskDateMapper.fromString(dto.reminder ?? null);

      TaskDateUtils.validateDateRange(start, end);

      if (dto.parentUuid !== undefined && dto.parentUuid !== null) {
        await this.validateParent(userUuid, dto.parentUuid);
      }

      const task = await this.taskRepository.create({
        userUuid,
        parentUuid: dto.parentUuid ?? null,
        name: dto.name.trim(),
        description: dto.description ?? null,
        status: 'PENDING',
        start,
        end,
        reminder,
      });

      this.logger.log('Successfully created task.', {
        userUuid,
        taskUuid: task.uuid,
        parentUuid: task.parentUuid,
        status: task.status,
      });
      return task;
    } catch (error) {
      if (error instanceof TaskException) {
        if (error.getStatus() < 500) {
          this.logger.warn('Rejected action to create task.', {
            userUuid,
            parentUuid: dto.parentUuid ?? null,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        } else {
          this.logger.error('Failed to create task.', undefined, {
            userUuid,
            parentUuid: dto.parentUuid ?? null,
            reason: error.message,
            statusCode: error.getStatus(),
          });
        }
        throw error;
      }

      this.logger.error('Failed to create task.', undefined, {
        userUuid,
        parentUuid: dto.parentUuid ?? null,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new TaskException();
    }
  }

  private async validateParent(
    userUuid: string,
    parentUuid: string,
  ): Promise<void> {
    const parent = await this.findTaskByUuid.execute(userUuid, parentUuid);

    if (parent.parentUuid !== null) {
      throw new TaskConflictException(
        'Subtasks cannot have their own subtasks.',
      );
    }

    if (parent.status === 'COMPLETED' || parent.status === 'CANCELLED') {
      throw new TaskConflictException(
        'Completed and cancelled tasks cannot receive new subtasks.',
      );
    }
  }
}
