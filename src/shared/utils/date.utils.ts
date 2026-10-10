import {
  APP_DATE_TIME_FORMATTER,
  APP_TIME_ZONE,
} from '#src/config/date-time.config.js';

const MAX_TIME_ZONE_ADJUSTMENTS = 3;

export class DateUtils {
  static dayAfter(day: string, days: number): Date {
    const date = new Date(`${day}T00:00:00Z`);

    date.setUTCDate(date.getUTCDate() + days);

    return this.parseLocalDateTime(
      `${date.toISOString().slice(0, 10)}T00:00:00`,
    );
  }

  static parseLocalDateTime(localDateTime: string): Date {
    const localTimestamp = new Date(`${localDateTime}Z`).getTime();

    if (!Number.isFinite(localTimestamp)) {
      throw new RangeError('The local date and time are invalid.');
    }

    let utcTimestamp = localTimestamp;

    for (let attempt = 0; attempt < MAX_TIME_ZONE_ADJUSTMENTS; attempt++) {
      const offsetMilliseconds = this.getTimeZoneOffsetMilliseconds(
        new Date(utcTimestamp),
      );
      const adjustedTimestamp = localTimestamp - offsetMilliseconds;

      if (adjustedTimestamp === utcTimestamp) break;
      utcTimestamp = adjustedTimestamp;
    }

    const utcDate = new Date(utcTimestamp);
    if (this.formatLocal(utcDate) !== localDateTime) {
      throw new RangeError(
        `The selected time does not exist in ${APP_TIME_ZONE}.`,
      );
    }

    return utcDate;
  }

  private static getTimeZoneOffsetMilliseconds(date: Date): number {
    const localDateTime = this.formatLocal(date);
    const localTimestamp = new Date(`${localDateTime}Z`).getTime();

    return localTimestamp - date.getTime();
  }

  static formatLocal(date: Date): string {
    const parts = new Map(
      APP_DATE_TIME_FORMATTER.formatToParts(date).map((part) => [
        part.type,
        part.value,
      ]),
    );

    const year = parts.get('year')?.padStart(4, '0');
    const month = parts.get('month');
    const day = parts.get('day');
    const hour = parts.get('hour');
    const minute = parts.get('minute');
    const second = parts.get('second');

    const localDate = `${year}-${month}-${day}`;
    const localTime = `${hour}:${minute}:${second}`;

    return `${localDate}T${localTime}`;
  }
}
