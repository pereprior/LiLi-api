import { Injectable } from '@nestjs/common';

import { ReminderEmailClient } from '#src/reminders/clients/reminder-email.client.js';
import { ReminderEmailError } from '#src/reminders/errors/reminder-email.error.js';
import { ReminderRepository } from '#src/reminders/repositories/reminder.repository.js';

const RETRY_MINUTES = [1, 5, 15, 60] as const;

@Injectable()
export class SendPendingRemindersService {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly email: ReminderEmailClient,
  ) {}

  async execute(): Promise<void> {
    await this.repository.createMissingReminders();
    await this.repository.cancelRemindersForIneligibleTasks();
    await this.repository.expireOverdueReminders(new Date());
    await this.repository.failExhaustedInterruptedReminders(new Date());

    for (let count = 0; count < 25; count++) {
      const reminder = await this.repository.reserveNextDueReminder(new Date());
      if (reminder === null) return;

      if (
        !(await this.repository.canSendReservedReminder(reminder, new Date()))
      )
        continue;

      let messageId: string;
      try {
        messageId = await this.email.send(reminder);
      } catch (error) {
        const retryMinutes = RETRY_MINUTES[reminder.attempts - 1];
        const retryable =
          !(error instanceof ReminderEmailError) || error.retryable;

        await this.repository.saveEmailFailure(
          reminder,
          error instanceof ReminderEmailError ? error.reason : 'UNKNOWN',
          retryable && retryMinutes !== undefined
            ? new Date(Date.now() + retryMinutes * 60_000)
            : null,
        );

        continue;
      }

      await this.repository.saveAcceptedEmail(reminder, new Date(), messageId);
    }
  }
}
