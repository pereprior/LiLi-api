import type { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';

export abstract class ReminderRepository {
  abstract createMissingReminders(): Promise<void>;
  abstract cancelRemindersForIneligibleTasks(): Promise<void>;
  abstract expireOverdueReminders(now: Date): Promise<void>;
  abstract failExhaustedInterruptedReminders(now: Date): Promise<void>;
  abstract reserveNextDueReminder(now: Date): Promise<ReminderEntity | null>;
  abstract canSendReservedReminder(
    reminder: ReminderEntity,
    now: Date,
  ): Promise<boolean>;
  abstract saveAcceptedEmail(
    reminder: ReminderEntity,
    now: Date,
    messageId: string,
  ): Promise<void>;
  abstract saveEmailFailure(
    reminder: ReminderEntity,
    reason: string,
    nextAttemptAt: Date | null,
  ): Promise<void>;
}
