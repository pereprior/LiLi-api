export class ReminderEntity {
  constructor(
    public readonly uuid: string,
    public readonly claimToken: string,
    public readonly attempts: number,
    public readonly dueAt: Date,
    public readonly taskName: string,
    public readonly recipient: string,
  ) {}
}
