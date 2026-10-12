import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReminderEmailClient } from '#src/reminders/clients/reminder-email.client.js';
import { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';
import { ReminderEmailError } from '#src/reminders/errors/reminder-email.error.js';
import { ReminderRepository } from '#src/reminders/repositories/reminder.repository.js';
import { SendPendingRemindersService } from '#src/reminders/services/send-pending-reminders/send-pending-reminders.service.js';

describe('SendPendingRemindersService', () => {
  let module: TestingModule;
  let service: SendPendingRemindersService;
  const createMissingReminders =
    vi.fn<ReminderRepository['createMissingReminders']>();
  const cancelRemindersForIneligibleTasks =
    vi.fn<ReminderRepository['cancelRemindersForIneligibleTasks']>();
  const expireOverdueReminders =
    vi.fn<ReminderRepository['expireOverdueReminders']>();
  const failExhaustedInterruptedReminders =
    vi.fn<ReminderRepository['failExhaustedInterruptedReminders']>();
  const reserveNextDueReminder =
    vi.fn<ReminderRepository['reserveNextDueReminder']>();
  const canSendReservedReminder =
    vi.fn<ReminderRepository['canSendReservedReminder']>();
  const saveAcceptedEmail = vi.fn<ReminderRepository['saveAcceptedEmail']>();
  const saveEmailFailure = vi.fn<ReminderRepository['saveEmailFailure']>();
  const send = vi.fn<ReminderEmailClient['send']>();

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T18:00:00Z'));
    createMissingReminders.mockReset().mockResolvedValue(undefined);
    cancelRemindersForIneligibleTasks.mockReset().mockResolvedValue(undefined);
    expireOverdueReminders.mockReset().mockResolvedValue(undefined);
    failExhaustedInterruptedReminders.mockReset().mockResolvedValue(undefined);
    reserveNextDueReminder.mockReset().mockResolvedValue(null);
    canSendReservedReminder.mockReset().mockResolvedValue(true);
    saveAcceptedEmail.mockReset().mockResolvedValue(undefined);
    saveEmailFailure.mockReset().mockResolvedValue(undefined);
    send.mockReset().mockResolvedValue('smtp-id');
    module = await Test.createTestingModule({
      providers: [
        SendPendingRemindersService,
        {
          provide: ReminderRepository,
          useValue: {
            createMissingReminders,
            cancelRemindersForIneligibleTasks,
            expireOverdueReminders,
            failExhaustedInterruptedReminders,
            reserveNextDueReminder,
            canSendReservedReminder,
            saveAcceptedEmail,
            saveEmailFailure,
          },
        },
        { provide: ReminderEmailClient, useValue: { send } },
      ],
    }).compile();
    service = module.get(SendPendingRemindersService);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await module.close();
  });

  describe('Sending', () => {
    it('does not send when no reminder is due', async () => {
      await service.execute();

      expect(send).not.toHaveBeenCalled();
    });

    it('waits for SMTP acceptance before persisting success', async () => {
      const reminder = new ReminderEntity(
        'reminder',
        'claim',
        1,
        new Date(),
        'Bins',
        'owner@example.com',
      );
      reserveNextDueReminder.mockResolvedValueOnce(reminder);
      const accepted = Promise.withResolvers<string>();
      send.mockReturnValueOnce(accepted.promise);

      const result = service.execute();
      await vi.waitFor(() => expect(send).toHaveBeenCalledWith(reminder));
      expect(saveAcceptedEmail).not.toHaveBeenCalled();
      accepted.resolve('smtp-id');
      await result;

      expect(saveAcceptedEmail).toHaveBeenCalledWith(
        reminder,
        new Date(),
        'smtp-id',
      );
    });

    it('discards a reservation invalidated by a task edit', async () => {
      reserveNextDueReminder.mockResolvedValueOnce(
        new ReminderEntity(
          'reminder',
          'claim',
          1,
          new Date(),
          'Bins',
          'owner@example.com',
        ),
      );
      canSendReservedReminder.mockResolvedValueOnce(false);

      await service.execute();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not interpret a persistence failure as a failed email', async () => {
      reserveNextDueReminder.mockResolvedValueOnce(
        new ReminderEntity(
          'reminder',
          'claim',
          1,
          new Date(),
          'Bins',
          'owner@example.com',
        ),
      );
      saveAcceptedEmail.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );

      await expect(service.execute()).rejects.toThrow('Database unavailable');

      expect(saveEmailFailure).not.toHaveBeenCalled();
    });
  });

  describe('Retries', () => {
    it.each([
      [1, 1],
      [2, 5],
      [3, 15],
      [4, 60],
    ])(
      'schedules retry after attempt %s in %s minutes',
      async (attempts, minutes) => {
        const reminder = new ReminderEntity(
          'reminder',
          'claim',
          attempts,
          new Date(),
          'Bins',
          'owner@example.com',
        );
        reserveNextDueReminder.mockResolvedValueOnce(reminder);
        send.mockRejectedValueOnce(
          new ReminderEmailError('SMTP_TEMPORARY', true),
        );

        await service.execute();

        expect(saveEmailFailure).toHaveBeenCalledWith(
          reminder,
          'SMTP_TEMPORARY',
          new Date(Date.now() + minutes * 60_000),
        );
      },
    );

    it('stops after the fifth failed attempt', async () => {
      const reminder = new ReminderEntity(
        'reminder',
        'claim',
        5,
        new Date(),
        'Bins',
        'owner@example.com',
      );
      reserveNextDueReminder.mockResolvedValueOnce(reminder);
      send.mockRejectedValueOnce(
        new ReminderEmailError('SMTP_TEMPORARY', true),
      );

      await service.execute();

      expect(saveEmailFailure).toHaveBeenCalledWith(
        reminder,
        'SMTP_TEMPORARY',
        null,
      );
    });

    it('does not retry a permanent failure', async () => {
      const reminder = new ReminderEntity(
        'reminder',
        'claim',
        1,
        new Date(),
        'Bins',
        'owner@example.com',
      );
      reserveNextDueReminder.mockResolvedValueOnce(reminder);
      send.mockRejectedValueOnce(
        new ReminderEmailError('AUTHENTICATION', false),
      );

      await service.execute();

      expect(saveEmailFailure).toHaveBeenCalledWith(
        reminder,
        'AUTHENTICATION',
        null,
      );
    });

    it('persists a safe category for unexpected errors', async () => {
      const reminder = new ReminderEntity(
        'reminder',
        'claim',
        1,
        new Date(),
        'Bins',
        'owner@example.com',
      );
      reserveNextDueReminder.mockResolvedValueOnce(reminder);
      send.mockRejectedValueOnce(new Error('private SMTP response'));

      await service.execute();

      expect(saveEmailFailure).toHaveBeenCalledWith(
        reminder,
        'UNKNOWN',
        new Date(Date.now() + 60_000),
      );
    });

    it('bounds each processing pass', async () => {
      reserveNextDueReminder.mockResolvedValue(
        new ReminderEntity(
          'reminder',
          'claim',
          1,
          new Date(),
          'Bins',
          'owner@example.com',
        ),
      );

      await service.execute();

      expect(send).toHaveBeenCalledTimes(25);
    });
  });
});
