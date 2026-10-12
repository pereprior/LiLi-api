import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsString,
} from 'class-validator';

import { StringToArray } from '#src/shared/transformer/string-to-array.transformer.js';
import { IsDateOnly } from '#src/shared/validators/is-date-only.validator.js';
import { IsOptionalUndefined } from '#src/shared/validators/is-optional-undefined.validator.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';
import type {
  TaskDateField,
  TaskSortDirection,
  TaskSortField,
  TaskView,
} from '#src/tasks/types/find-task-options.type.js';

export class FindTasksDto {
  @IsOptionalUndefined()
  @StringToArray()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TaskStatus, { each: true })
  readonly status?: TaskStatus[];

  @IsOptionalUndefined()
  @IsString()
  readonly search?: string;

  @IsOptionalUndefined()
  @IsIn(['start', 'end'])
  readonly dateField?: TaskDateField;

  @IsOptionalUndefined()
  @IsDateOnly()
  readonly dateFrom?: string;

  @IsOptionalUndefined()
  @IsDateOnly()
  readonly dateTo?: string;

  @IsOptionalUndefined()
  @IsIn(['createdAt', 'priority', 'start', 'end'])
  readonly sortBy?: TaskSortField;

  @IsOptionalUndefined()
  @IsIn(['asc', 'desc'])
  readonly sortDirection?: TaskSortDirection;

  @IsOptionalUndefined()
  @IsIn(['overdue', 'today', 'upcoming'])
  readonly view?: TaskView;
}
