import { Injectable } from '@nestjs/common';

import { AppLogger } from '#src/logging/app-logger.js';
import type { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

@Injectable()
export class CreateTaskService {
  private readonly logger = new AppLogger('CreateTaskService');

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly findTaskByUuid: FindTaskByUuidService,
  ) {}

  async execute(userUuid: string, dto: CreateTaskDto): Promise<TaskEntity> {
    try {
      const start = TaskDateMapper.fromString(dto.start ?? null);
      const end = TaskDateMapper.fromString(dto.end ?? null);
      const reminder = TaskDateMapper.fromString(dto.reminder ?? null);

      this.validateDateRange(start, end);

      if (dto.parentUuid !== undefined && dto.parentUuid !== null) {
        await this.validateParent(userUuid, dto.parentUuid);
      }

      return await this.taskRepository.create({
        userUuid,
        parentUuid: dto.parentUuid ?? null,
        name: dto.name.trim(),
        description: dto.description ?? null,
        status: 'PENDING',
        start,
        end,
        reminder,
      });
    } catch (error) {
      if (error instanceof TaskException) throw error;

      this.logger.error('Failed to create task.');
      throw new TaskException();
    }
  }

  private validateDateRange(
    start: TaskDateEntity | null,
    end: TaskDateEntity | null,
  ): void {
    if (start === null || end === null) return;

    const endsOnEarlierDay = end.date < start.date;
    const endsAtEarlierTime =
      end.date === start.date &&
      start.time !== null &&
      end.time !== null &&
      end.time < start.time;

    if (endsOnEarlierDay || endsAtEarlierTime) {
      throw new TaskValidationException('Task end cannot precede its start.');
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
