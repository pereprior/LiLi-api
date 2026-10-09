import { Logger } from '@nestjs/common';

export class AppLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  log(message: string, context?: Record<string, unknown>): void {
    this.logger.log(context === undefined ? message : { message, ...context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context === undefined ? message : { message, ...context });
  }

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.logger.error(
      context === undefined ? message : { message, ...context },
      error?.stack,
    );
  }
}
