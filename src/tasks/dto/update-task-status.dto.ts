import { IsEnum } from 'class-validator';

import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  readonly status!: TaskStatus;
}
