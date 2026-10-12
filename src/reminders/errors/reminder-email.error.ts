export class ReminderEmailError extends Error {
  constructor(
    public readonly reason: string,
    public readonly retryable: boolean,
  ) {
    super(reason);
  }
}
