export class TaskDateEntity {
  constructor(
    public readonly date: string,
    public readonly time: string | null = null,
  ) {}
}
