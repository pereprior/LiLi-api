import { describe, expect, it } from 'vitest';

import { createRemindersConfig } from '#src/reminders/config/reminders.config.js';

describe('Reminders configuration', () => {
  it('disables sending until explicitly enabled', () => {
    expect(
      createRemindersConfig({
        REMINDERS_GMAIL_USER: 'sender@gmail.com',
        REMINDERS_GMAIL_APP_PASSWORD: 'test-password',
      }),
    ).toEqual({
      enabled: false,
      gmailUser: 'sender@gmail.com',
      gmailAppPassword: 'test-password',
    });
  });

  it('normalizes a Gmail app password copied in groups', () => {
    expect(
      createRemindersConfig({
        REMINDERS_ENABLED: 'true',
        REMINDERS_GMAIL_USER: 'sender@gmail.com',
        REMINDERS_GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
      }),
    ).toEqual({
      enabled: true,
      gmailUser: 'sender@gmail.com',
      gmailAppPassword: 'abcdefghijklmnop',
    });
  });

  it.each(['true', 'false'])(
    'requires a sender when REMINDERS_ENABLED=%s',
    (enabled) => {
      expect(() =>
        createRemindersConfig({
          REMINDERS_ENABLED: enabled,
          REMINDERS_GMAIL_APP_PASSWORD: 'test-password',
        }),
      ).toThrow('REMINDERS_GMAIL_USER is required.');
    },
  );

  it.each(['true', 'false'])(
    'requires a password when REMINDERS_ENABLED=%s',
    (enabled) => {
      expect(() =>
        createRemindersConfig({
          REMINDERS_ENABLED: enabled,
          REMINDERS_GMAIL_USER: 'sender@gmail.com',
        }),
      ).toThrow('REMINDERS_GMAIL_APP_PASSWORD is required.');
    },
  );

  it.each(['', '   '])('rejects an empty password (%j)', (password) => {
    expect(() =>
      createRemindersConfig({
        REMINDERS_GMAIL_USER: 'sender@gmail.com',
        REMINDERS_GMAIL_APP_PASSWORD: password,
      }),
    ).toThrow('REMINDERS_GMAIL_APP_PASSWORD is required.');
  });

  it('rejects a non-Gmail sender when enabled', () => {
    expect(() =>
      createRemindersConfig({
        REMINDERS_ENABLED: 'true',
        REMINDERS_GMAIL_USER: 'invalid',
        REMINDERS_GMAIL_APP_PASSWORD: 'password',
      }),
    ).toThrow('REMINDERS_GMAIL_USER must be a Gmail address.');
  });

  it('rejects misspelled enabled values', () => {
    expect(() => createRemindersConfig({ REMINDERS_ENABLED: 'yes' })).toThrow(
      'REMINDERS_ENABLED must be true or false.',
    );
  });
});
