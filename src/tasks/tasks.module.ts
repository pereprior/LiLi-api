import { Module } from '@nestjs/common';

import { DatabaseModule } from '#src/database/database.module.js';
import { PrismaTaskRepository } from '#src/tasks/repositories/prisma-task.repository.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    CreateTaskService,
    FindTaskByUuidService,
    UpdateTaskStatusService,
    UpdateTaskDetailsService,
    FindAllTasksService,
    DeleteTaskService,
    {
      provide: TaskRepository,
      useClass: PrismaTaskRepository,
    },
  ],
  exports: [
    TaskRepository,
    CreateTaskService,
    FindTaskByUuidService,
    DeleteTaskService,
    FindAllTasksService,
    UpdateTaskDetailsService,
    UpdateTaskStatusService,
  ],
})
export class TasksModule {}
