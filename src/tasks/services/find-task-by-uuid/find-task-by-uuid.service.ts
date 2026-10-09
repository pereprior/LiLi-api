import { Injectable } from '@nestjs/common';

import { AppLogger } from '#src/logging/app-logger.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskException } from '#src/tasks/exceptions/task.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';

@Injectable()
export class FindTaskByUuidService {
  private readonly logger = new AppLogger('FindTaskByUuidService');

  constructor(private readonly taskRepository: TaskRepository) {}

  async execute(userUuid: string, uuid: string): Promise<TaskEntity> {
    try {
      const task = await this.taskRepository.findByUuid(userUuid, uuid);
      if (task === null) throw new TaskNotFoundException();

      return task;
    } catch (error) {
      if (error instanceof TaskException) throw error;

      this.logger.error('Failed to find task.');
      throw new TaskException();
    }
  }
}
