import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import type { TaskDateData } from '#src/tasks/types/data/task-date.data.js';
import { DateUtils } from '#src/utils/date.utils.js';

export class TaskDateMapper {
  static fromString(dateTime: string | null): TaskDateEntity | null {
    if (dateTime === null) return null;

    const timeSeparatorIndex = dateTime.indexOf('T');
    const hasTime = timeSeparatorIndex !== -1;

    const date = hasTime ? dateTime.slice(0, timeSeparatorIndex) : dateTime;
    const time = hasTime ? dateTime.slice(timeSeparatorIndex + 1) : null;
    const taskDate = new TaskDateEntity(date, time);

    return taskDate;
  }

  static toData(taskDate: TaskDateEntity | null): TaskDateData {
    if (taskDate === null) {
      return { date: null, hasTime: false };
    }

    const hasTime = taskDate.time !== null;
    const localTime = taskDate.time ?? '00:00';
    const localDateTime = `${taskDate.date}T${localTime}:00`;

    try {
      return {
        date: DateUtils.parseLocalDateTime(localDateTime),
        hasTime,
      };
    } catch (error) {
      if (error instanceof RangeError) {
        throw new TaskValidationException(error.message);
      }
      throw error;
    }
  }

  static fromData(data: TaskDateData): TaskDateEntity | null {
    if (data.date === null) return null;

    const localDateTime = DateUtils.formatLocal(data.date);
    const timeSeparatorIndex = localDateTime.indexOf('T');

    const date = localDateTime.slice(0, timeSeparatorIndex);
    const timeWithSeconds = localDateTime.slice(timeSeparatorIndex + 1);
    const secondsSeparatorIndex = timeWithSeconds.lastIndexOf(':');
    const time = timeWithSeconds.slice(0, secondsSeparatorIndex);

    return new TaskDateEntity(date, data.hasTime ? time : null);
  }
}
