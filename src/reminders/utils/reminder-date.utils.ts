import { DateUtils } from '#src/shared/utils/date.utils.js';
import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';

export class ReminderDateUtils {
  static dueAt(reminder: TaskDateEntity): Date {
    return DateUtils.parseLocalDateTime(
      `${reminder.date}T${reminder.time ?? '06:00'}:00`,
    );
  }
}
