import { IsUUID } from 'class-validator';

import { UpdateTaskStatusDto } from '#src/tasks/dto/update-task-status.dto.js';

export class UpdateTaskStatusActionDto extends UpdateTaskStatusDto {
  @IsUUID()
  readonly uuid!: string;
}
