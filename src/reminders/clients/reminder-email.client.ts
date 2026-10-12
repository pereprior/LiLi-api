import type { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';

export abstract class ReminderEmailClient {
  abstract send(reminder: ReminderEntity): Promise<string>;
}
