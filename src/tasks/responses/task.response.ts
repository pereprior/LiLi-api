import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import type { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import type { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

export class TaskResponse {
  constructor(
    public readonly uuid: string,
    public readonly userUuid: string,
    public readonly parentUuid: string | null,
    public readonly name: string,
    public readonly description: string | null,
    public readonly status: TaskStatus,
    public readonly priority: TaskPriority,
    public readonly start: TaskDateEntity | null,
    public readonly end: TaskDateEntity | null,
    public readonly reminder: TaskDateEntity | null,
  ) {}
}
