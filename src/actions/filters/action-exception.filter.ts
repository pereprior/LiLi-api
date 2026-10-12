import { type ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { ActionValidationError } from '#src/actions/errors/action-validation.error.js';
import { UnknownActionError } from '#src/actions/errors/unknown-action.error.js';

@Catch(ActionValidationError, UnknownActionError)
export class ActionExceptionFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(
    exception: ActionValidationError | UnknownActionError,
    host: ArgumentsHost,
  ): void {
    super.catch(
      new BadRequestException(
        exception instanceof ActionValidationError
          ? exception.messages
          : exception.message,
      ),
      host,
    );
  }
}
