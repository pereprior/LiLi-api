const GMAIL_ADDRESS_PATTERN = /^[^\s@]+@gmail\.com$/iu;

export class ReminderEmailUtils {
  static parseGmailAddress(value: string | undefined): string {
    if (value === undefined || value.trim() === '') {
      throw new Error('REMINDERS_GMAIL_USER is required.');
    }

    const email = value.trim();
    if (!GMAIL_ADDRESS_PATTERN.test(email)) {
      throw new Error('REMINDERS_GMAIL_USER must be a Gmail address.');
    }

    return email;
  }
}
