export class ActionValidationError extends Error {
  constructor(public readonly messages: string[]) {
    super('Invalid action input.');
    this.name = 'ActionValidationError';
  }
}
