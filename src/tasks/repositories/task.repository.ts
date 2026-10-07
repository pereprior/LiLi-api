import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import type { CreateTaskData } from '#src/tasks/types/data/create-task.data.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';

export abstract class TaskRepository {
  abstract create(data: CreateTaskData): Promise<TaskEntity>;

  abstract findAll(userUuid: string): Promise<TaskEntity[]>;

  abstract findByUuid(
    userUuid: string,
    uuid: string,
  ): Promise<TaskEntity | null>;

  abstract update(
    userUuid: string,
    uuid: string,
    data: UpdateTaskData,
  ): Promise<TaskEntity>;

  abstract delete(userUuid: string, uuid: string): Promise<void>;
}
