import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';

export class TaskDateUtils {
  static validateDateRange(
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
}
