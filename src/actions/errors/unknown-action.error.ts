export class UnknownActionError extends Error {
  constructor() {
    super('Unknown action.');
    this.name = 'UnknownActionError';
  }
}
