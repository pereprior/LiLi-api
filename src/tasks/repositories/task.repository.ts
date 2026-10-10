import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import type { CreateTaskData } from '#src/tasks/types/data/create-task.data.js';
import type { FindTasksData } from '#src/tasks/types/data/find-tasks.data.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';

export abstract class TaskRepository {
  abstract transaction<T>(
    operation: (repository: TaskRepository) => Promise<T>,
  ): Promise<T>;

  abstract create(data: CreateTaskData): Promise<TaskEntity>;

  abstract findAll(
    userUuid: string,
    query: FindTasksData,
  ): Promise<TaskEntity[]>;

  abstract findByUuid(
    userUuid: string,
    uuid: string,
  ): Promise<TaskEntity | null>;

  abstract findSubtasks(
    userUuid: string,
    parentUuid: string,
  ): Promise<TaskEntity[]>;

  abstract update(
    userUuid: string,
    uuid: string,
    data: UpdateTaskData,
  ): Promise<TaskEntity>;

  abstract delete(userUuid: string, uuid: string): Promise<void>;

  abstract softDelete(userUuid: string, uuid: string): Promise<void>;
}
