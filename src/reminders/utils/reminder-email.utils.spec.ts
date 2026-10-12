import { describe, expect, it } from 'vitest';

import { ReminderEmailUtils } from '#src/reminders/utils/reminder-email.utils.js';

describe('ReminderEmailUtils', () => {
  it('trims a Gmail address', () => {
    expect(ReminderEmailUtils.parseGmailAddress(' sender@gmail.com ')).toBe(
      'sender@gmail.com',
    );
  });

  it('accepts a Gmail domain regardless of casing', () => {
    expect(ReminderEmailUtils.parseGmailAddress('sender@GMAIL.COM')).toBe(
      'sender@GMAIL.COM',
    );
  });

  it.each([undefined, '', '   '])('rejects a missing address (%j)', (email) => {
    expect(() => ReminderEmailUtils.parseGmailAddress(email)).toThrow(
      'REMINDERS_GMAIL_USER is required.',
    );
  });

  it.each([
    'invalid',
    'sender@example.com',
    'sender@gmail.com.example.com',
    'sender name@gmail.com',
  ])('rejects an invalid Gmail address (%s)', (email) => {
    expect(() => ReminderEmailUtils.parseGmailAddress(email)).toThrow(
      'REMINDERS_GMAIL_USER must be a Gmail address.',
    );
  });
});
