import { Inject, Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

import { ReminderEmailClient } from '#src/reminders/clients/reminder-email.client.js';
import { remindersConfig } from '#src/reminders/config/reminders.config.js';
import type { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';
import { ReminderEmailError } from '#src/reminders/errors/reminder-email.error.js';
import type { RemindersConfig } from '#src/reminders/types/reminders-config.type.js';
import { DateUtils } from '#src/shared/utils/date.utils.js';

@Injectable()
export class GmailReminderEmailClient extends ReminderEmailClient {
  constructor(
    @Inject(remindersConfig.KEY) private readonly config: RemindersConfig,
  ) {
    super();
  }

  override async send(reminder: ReminderEntity): Promise<string> {
    if (!this.config.enabled) {
      throw new ReminderEmailError('DISABLED', false);
    }

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.gmailUser,
        pass: this.config.gmailAppPassword,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    try {
      const result = await transport.sendMail({
        from: { name: 'LiLi', address: this.config.gmailUser },
        to: { address: reminder.recipient, name: '' },
        subject: `Recordatorio de LiLi: ${reminder.taskName.replace(/[\r\n]/gu, ' ')}`,
        text: [
          `Recordatorio: ${reminder.taskName}`,
          `Hora prevista: ${DateUtils.formatLocal(reminder.dueAt).slice(0, 16)} (Europe/Madrid).`,
          'Si este aviso llega tarde, LiLi ha recuperado un recordatorio pendiente.',
        ].join('\n\n'),
      });

      return result.messageId;
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error ? error.code : null;
      const responseCode =
        error instanceof Error && 'responseCode' in error
          ? error.responseCode
          : null;

      if (code === 'EAUTH') {
        throw new ReminderEmailError('AUTHENTICATION', false);
      }

      if (typeof responseCode === 'number' && responseCode >= 500) {
        throw new ReminderEmailError('SMTP_PERMANENT', false);
      }

      throw new ReminderEmailError('SMTP_TEMPORARY', true);
    } finally {
      transport.close();
    }
  }
}
