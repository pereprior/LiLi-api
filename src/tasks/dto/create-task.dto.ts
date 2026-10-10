import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { IsDateOrDateTime } from '#src/shared/validators/is-date-or-date-time.validator.js';
import { IsOptionalUndefined } from '#src/shared/validators/is-optional-undefined.validator.js';
import { IsRequiredString } from '#src/shared/validators/is-required-string.validator.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';

export class CreateTaskDto {
  @IsRequiredString()
  readonly name!: string;

  @IsOptionalUndefined()
  @IsEnum(TaskPriority)
  readonly priority?: TaskPriority;

  @IsOptional()
  @IsString()
  readonly description?: string | null;

  @IsOptional()
  @IsUUID()
  readonly parentUuid?: string | null;

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
