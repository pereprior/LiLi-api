import { IsOptional, IsString } from 'class-validator';

import { IsDateOrDateTime } from '#src/shared/validators/is-date-or-date-time.validator.js';
import { IsRequiredString } from '#src/shared/validators/is-required-string.validator.js';

export class UpdateTaskDetailsDto {
  @IsRequiredString({ allowUndefined: true })
  readonly name?: string;

  @IsOptional()
  @IsString()
  readonly description?: string | null;

  @IsOptional()
  @IsDateOrDateTime()
  readonly start?: string | null;

  @IsOptional()
  @IsDateOrDateTime()
  readonly end?: string | null;

  @IsOptional()
  @IsDateOrDateTime()
  readonly reminder?: string | null;
}
