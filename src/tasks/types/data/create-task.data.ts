import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import type { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import type { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

export type CreateTaskData = {
  userUuid: string;
  name: string;
  parentUuid?: string | null;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  start?: TaskDateEntity | null;
  end?: TaskDateEntity | null;
  reminder?: TaskDateEntity | null;
};
