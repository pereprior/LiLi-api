import { HttpException, HttpStatus } from '@nestjs/common';

export class TaskException extends HttpException {
  constructor(
    message = 'An unexpected error occurred while processing the task.',
    status = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message, status);
    this.name = 'TaskException';
  }
}
