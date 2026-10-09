import { TaskStatus } from '@prisma/client';

import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';

const ALL_TASK_STATUSES = Object.values(TaskStatus);
const ALLOWED_SUBTASK_STATUSES: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ['PENDING'],
  SCHEDULED: ['PENDING', 'SCHEDULED'],
  IN_PROGRESS: ALL_TASK_STATUSES,
  PAUSED: ALL_TASK_STATUSES,
  BLOCKED: ALL_TASK_STATUSES,
  COMPLETED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: ['CANCELLED'],
};

export class TaskStateRulesUtils {
  static assertEditable(task: TaskEntity): void {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new TaskConflictException(
        'Completed and cancelled tasks are immutable.',
      );
    }
  }

  static validateScheduledStart(
    status: TaskStatus,
    start: TaskDateEntity | null,
  ): void {
    if (status === 'SCHEDULED' && start === null) {
      throw new TaskValidationException(
        'Scheduled tasks require a start date.',
      );
    }
  }

  static validateSubtaskStatus(
    principalStatus: TaskStatus,
    subtaskStatus: TaskStatus,
  ): void {
    if (!ALLOWED_SUBTASK_STATUSES[principalStatus].includes(subtaskStatus)) {
      throw new TaskConflictException(
        `Subtask status ${subtaskStatus} is incompatible with principal status ${principalStatus}.`,
      );
    }
  }
}
