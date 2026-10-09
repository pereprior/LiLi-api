import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskResponse } from '#src/tasks/responses/task.response.js';

export class TaskResponseMapper {
  static toResponse(task: TaskEntity): TaskResponse {
    return new TaskResponse(
      task.uuid,
      task.userUuid,
      task.parentUuid,
      task.name,
      task.description,
      task.status,
      task.start,
      task.end,
      task.reminder,
    );
  }

  static toListResponse(tasks: TaskEntity[]): TaskResponse[] {
    return tasks.map((task) => this.toResponse(task));
  }
}
