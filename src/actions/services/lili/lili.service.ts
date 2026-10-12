import { Inject, Injectable } from '@nestjs/common';
import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActionValidationError } from '#src/actions/errors/action-validation.error.js';
import { UnknownActionError } from '#src/actions/errors/unknown-action.error.js';
import { ActionResponse } from '#src/actions/responses/action.response.js';
import {
  ACTION_HANDLERS,
  type ActionHandlers,
  type ActionName,
  type ActionRequest,
} from '#src/actions/types/action-contracts.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';

@Injectable()
export class LiliService {
  constructor(
    @Inject(ACTION_HANDLERS) private readonly handlers: ActionHandlers,
  ) {}

  async execute<Name extends ActionName>(
    request: ActionRequest<Name>,
  ): Promise<ActionResponse<Name>> {
    if (!request || !Object.hasOwn(this.handlers, request.action)) {
      throw new UnknownActionError();
    }

    const handler = this.handlers[request.action];
    const actor = await this.validateInput(ParamUuidDto, request.actor);
    const payload = await this.validateInput(
      handler.payloadType,
      request.payload,
    );
    const result = await handler.execute(actor, payload);
    return new ActionResponse(request.action, result);
  }

  private async validateInput<Input extends object>(
    inputType: ClassConstructor<Input>,
    input: Input,
  ): Promise<Input> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new ActionValidationError(['Input must be an object.']);
    }

    const instance = plainToInstance(inputType, input);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    if (errors.length > 0) {
      throw new ActionValidationError(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
    return instance;
  }
}
