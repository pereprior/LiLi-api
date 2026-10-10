import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

import { StringToArray } from '#src/shared/transformer/string-to-array.transformer.js';
import { IsDateOnly } from '#src/shared/validators/is-date-only.validator.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';
import type {
  TaskDateField,
  TaskSortDirection,
  TaskSortField,
  TaskView,
} from '#src/tasks/types/find-task-options.type.js';

export class FindTasksDto {
  @IsOptional()
  @StringToArray()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TaskStatus, { each: true })
  readonly status?: TaskStatus[];

  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @IsIn(['start', 'end'])
  readonly dateField?: TaskDateField;

  @IsOptional()
  @IsDateOnly()
  readonly dateFrom?: string;

  @IsOptional()
  @IsDateOnly()
  readonly dateTo?: string;

  @IsOptional()
  @IsIn(['createdAt', 'priority', 'start', 'end'])
  readonly sortBy?: TaskSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  readonly sortDirection?: TaskSortDirection;

  @IsOptional()
  @IsIn(['overdue', 'today', 'upcoming'])
  readonly view?: TaskView;
}
