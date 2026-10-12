import { Injectable } from '@nestjs/common';

import { UpdateTaskDetailsActionDto } from '#src/actions/modules/tasks/dto/update-task-details-action.dto.js';
import { UpdateTaskStatusActionDto } from '#src/actions/modules/tasks/dto/update-task-status-action.dto.js';
import type { TaskActionHandlers } from '#src/actions/modules/tasks/types/task-action-contracts.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import type { DeleteResponse } from '#src/shared/responses/delete.response.js';
import { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';

@Injectable()
export class TaskActions {
  readonly handlers: TaskActionHandlers;

  constructor(
    createTask: CreateTaskService,
    findAllTasks: FindAllTasksService,
    findTaskByUuid: FindTaskByUuidService,
    updateTaskDetails: UpdateTaskDetailsService,
    updateTaskStatus: UpdateTaskStatusService,
    deleteTask: DeleteTaskService,
  ) {
    this.handlers = {
      'tasks.create': {
        payloadType: CreateTaskDto,
        execute: (actor, payload): Promise<TaskEntity> =>
          createTask.execute(actor, payload),
      },
      'tasks.findAll': {
        payloadType: FindTasksDto,
        execute: (actor, payload): Promise<TaskEntity[]> =>
          findAllTasks.execute(actor, payload),
      },
      'tasks.findByUuid': {
        payloadType: ParamUuidDto,
        execute: (actor, payload): Promise<TaskEntity> =>
          findTaskByUuid.execute(actor, payload),
      },
      'tasks.updateDetails': {
        payloadType: UpdateTaskDetailsActionDto,
        execute: (actor, { uuid, ...details }): Promise<TaskEntity> =>
          updateTaskDetails.execute(actor, { uuid }, details),
      },
      'tasks.updateStatus': {
        payloadType: UpdateTaskStatusActionDto,
        execute: (actor, { uuid, status }): Promise<TaskEntity> =>
          updateTaskStatus.execute(actor, { uuid }, { status }),
      },
      'tasks.delete': {
        payloadType: ParamUuidDto,
        execute: (actor, payload): Promise<DeleteResponse> =>
          deleteTask.execute(actor, payload),
      },
    };
  }
}
