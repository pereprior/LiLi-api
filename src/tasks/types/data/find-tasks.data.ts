import type { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';
import type {
  TaskDateField,
  TaskSortDirection,
  TaskSortField,
} from '#src/tasks/types/find-task-options.type.js';

export interface FindTasksData {
  status?: TaskStatus[];
  excludeFinished?: boolean;
  search?: string;
  dateField?: TaskDateField;
  dateFrom?: Date;
  dateTo?: Date;
  overdue?: { now: Date; startOfDay: Date };
  sortBy: TaskSortField;
  sortDirection: TaskSortDirection;
}
