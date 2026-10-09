import type { TaskStatus } from '@prisma/client';

import type { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';

export type UpdateTaskData = {
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  start?: TaskDateEntity | null;
  end?: TaskDateEntity | null;
  reminder?: TaskDateEntity | null;
  deletedAt?: Date | null;
};
