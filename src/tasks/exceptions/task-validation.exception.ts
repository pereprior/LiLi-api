import { HttpStatus } from '@nestjs/common';

import { TaskException } from '#src/tasks/exceptions/task.exception.js';

export class TaskValidationException extends TaskException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
    this.name = 'TaskValidationException';
  }
}
