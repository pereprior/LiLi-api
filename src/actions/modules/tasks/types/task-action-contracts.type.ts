import type { UpdateTaskDetailsActionDto } from '#src/actions/modules/tasks/dto/update-task-details-action.dto.js';
import type { UpdateTaskStatusActionDto } from '#src/actions/modules/tasks/dto/update-task-status-action.dto.js';
import type { ActionHandler } from '#src/actions/types/action-handler.type.js';
import type { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import type { DeleteResponse } from '#src/shared/responses/delete.response.js';
import type { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import type { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';

export interface TaskActionContracts {
  'tasks.create': { payload: CreateTaskDto; result: TaskEntity };
  'tasks.findAll': { payload: FindTasksDto; result: TaskEntity[] };
  'tasks.findByUuid': { payload: ParamUuidDto; result: TaskEntity };
  'tasks.updateDetails': {
    payload: UpdateTaskDetailsActionDto;
    result: TaskEntity;
  };
  'tasks.updateStatus': {
    payload: UpdateTaskStatusActionDto;
    result: TaskEntity;
  };
  'tasks.delete': { payload: ParamUuidDto; result: DeleteResponse };
}

export type TaskActionHandlers = {
  [Name in keyof TaskActionContracts]: ActionHandler<
    TaskActionContracts[Name]['payload'],
    TaskActionContracts[Name]['result']
  >;
};
