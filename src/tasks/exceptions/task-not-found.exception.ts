import { HttpStatus } from '@nestjs/common';

import { TaskException } from '#src/tasks/exceptions/task.exception.js';

export class TaskNotFoundException extends TaskException {
  constructor() {
    super('Task not found.', HttpStatus.NOT_FOUND);
    this.name = 'TaskNotFoundException';
  }
}
