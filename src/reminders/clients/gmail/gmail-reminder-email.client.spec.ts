import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GmailReminderEmailClient } from '#src/reminders/clients/gmail/gmail-reminder-email.client.js';
import { remindersConfig } from '#src/reminders/config/reminders.config.js';
import { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';
import { ReminderEmailError } from '#src/reminders/errors/reminder-email.error.js';

const { sendMail, close, createTransport } = vi.hoisted(() => {
  const sendMail =
    vi.fn<(options: unknown) => Promise<{ messageId: string }>>();
  const close = vi.fn<() => void>();
  const createTransport = vi.fn<
    (options: unknown) => { sendMail: typeof sendMail; close: typeof close }
  >(() => ({ sendMail, close }));
  return { sendMail, close, createTransport };
});
vi.mock('nodemailer', () => ({ default: { createTransport } }));

describe('GmailReminderEmailClient', () => {
  let module: TestingModule;
  let client: GmailReminderEmailClient;

  beforeEach(async () => {
    sendMail.mockReset().mockResolvedValue({ messageId: 'smtp-id' });
    module = await Test.createTestingModule({
      providers: [
        GmailReminderEmailClient,
        {
          provide: remindersConfig.KEY,
          useValue: {
            enabled: true,
            gmailUser: 'lili.reminder.noreply@gmail.com',
            gmailAppPassword: 'test-password',
          },
        },
      ],
    }).compile();
    client = module.get(GmailReminderEmailClient);
  });

  afterEach(async () => {
    await module.close();
  });

  it('addresses the reminder to its owner and includes the scheduled Madrid time', async () => {
    const reminder = new ReminderEntity(
      'reminder',
      'claim',
      1,
      new Date('2026-10-11T18:00:00Z'),
      'Bins',
      'owner@example.com',
    );

    await expect(client.send(reminder)).resolves.toBe('smtp-id');

    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'LiLi', address: 'lili.reminder.noreply@gmail.com' },
      to: { name: '', address: 'owner@example.com' },
      subject: 'Recordatorio de LiLi: Bins',
      text: 'Recordatorio: Bins\n\nHora prevista: 2026-10-11T20:00 (Europe/Madrid).\n\nSi este aviso llega tarde, LiLi ha recuperado un recordatorio pendiente.',
    });
  });

  it('uses authenticated Gmail SMTP with finite timeouts', async () => {
    await client.send(
      new ReminderEntity(
        'reminder',
        'claim',
        1,
        new Date(),
        'Bins',
        'owner@example.com',
      ),
    );

    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'lili.reminder.noreply@gmail.com', pass: 'test-password' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('refuses SMTP access when sending is disabled', async () => {
    const config = module.get<{ enabled: boolean }>(remindersConfig.KEY);
    config.enabled = false;

    await expect(
      client.send(
        new ReminderEntity(
          'reminder',
          'claim',
          1,
          new Date(),
          'Bins',
          'owner@example.com',
        ),
      ),
    ).rejects.toEqual(new ReminderEmailError('DISABLED', false));

    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([
    ['authentication', { code: 'EAUTH' }, 'AUTHENTICATION', false],
    ['recipient rejection', { responseCode: 550 }, 'SMTP_PERMANENT', false],
    ['rate limit', { responseCode: 421 }, 'SMTP_TEMPORARY', true],
    ['timeout', { code: 'ETIMEDOUT' }, 'SMTP_TEMPORARY', true],
  ] as const)(
    'classifies %s without retaining the SMTP response',
    async (_name, fields, reason, retryable) => {
      sendMail.mockRejectedValueOnce(
        Object.assign(new Error('private response'), fields),
      );

      await expect(
        client.send(
          new ReminderEntity(
            'reminder',
            'claim',
            1,
            new Date(),
            'Bins',
            'owner@example.com',
          ),
        ),
      ).rejects.toEqual(new ReminderEmailError(reason, retryable));

      expect(close).toHaveBeenCalledOnce();
    },
  );
});
