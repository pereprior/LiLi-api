import { IsUUID } from 'class-validator';

import { UpdateTaskDetailsDto } from '#src/tasks/dto/update-task-details.dto.js';

export class UpdateTaskDetailsActionDto extends UpdateTaskDetailsDto {
  @IsUUID()
  readonly uuid!: string;
}
