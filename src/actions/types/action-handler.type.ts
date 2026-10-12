import type { ClassConstructor } from 'class-transformer';

import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';

export interface ActionHandler<Payload extends object, Result> {
  readonly payloadType: ClassConstructor<Payload>;
  execute(actor: ParamUuidDto, payload: Payload): Promise<Result>;
}
