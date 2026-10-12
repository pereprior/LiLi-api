import { registerAs } from '@nestjs/config';

import type { RemindersConfig } from '#src/reminders/types/reminders-config.type.js';
import { ReminderEmailUtils } from '#src/reminders/utils/reminder-email.utils.js';
import { StringUtils } from '#src/shared/utils/string.utils.js';

export const REMINDER_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REMINDER_RESERVATION_DURATION_MS = 5 * 60 * 1000;

export function createRemindersConfig(
  environment: Record<string, string | undefined>,
): RemindersConfig {
  const enabledValue = environment.REMINDERS_ENABLED ?? 'false';

  if (enabledValue !== 'true' && enabledValue !== 'false') {
    throw new Error('REMINDERS_ENABLED must be true or false.');
  }

  const enabled = enabledValue === 'true';

  const gmailUser = ReminderEmailUtils.parseGmailAddress(
    environment.REMINDERS_GMAIL_USER,
  );

  const password = environment.REMINDERS_GMAIL_APP_PASSWORD;
  if (password === undefined || password.trim() === '') {
    throw new Error('REMINDERS_GMAIL_APP_PASSWORD is required.');
  }
  const gmailAppPassword = StringUtils.removeWhitespace(password);

  return { enabled, gmailUser, gmailAppPassword };
}

export const remindersConfig = registerAs('reminders', (): RemindersConfig =>
  createRemindersConfig(process.env),
);
