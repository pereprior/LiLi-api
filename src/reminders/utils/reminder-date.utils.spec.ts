import { describe, expect, it } from 'vitest';

import { ReminderDateUtils } from '#src/reminders/utils/reminder-date.utils.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';

describe('ReminderDateUtils', () => {
  it.each([
    ['2026-01-10', '2026-01-10T05:00:00Z'],
    ['2026-07-10', '2026-07-10T04:00:00Z'],
    ['2026-03-29', '2026-03-29T04:00:00Z'],
    ['2026-10-25', '2026-10-25T05:00:00Z'],
  ])(
    'schedules a date-only reminder on %s at 06:00 Madrid',
    (day, expected) => {
      expect(ReminderDateUtils.dueAt(new TaskDateEntity(day))).toEqual(
        new Date(expected),
      );
    },
  );

  it('preserves an explicit midnight', () => {
    expect(
      ReminderDateUtils.dueAt(new TaskDateEntity('2026-07-10', '00:00')),
    ).toEqual(new Date('2026-07-09T22:00:00Z'));
  });
});
