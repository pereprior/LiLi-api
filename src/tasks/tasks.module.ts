import { Module } from '@nestjs/common';

import { DatabaseModule } from '#src/database/database.module.js';
import { PrismaTaskRepository } from '#src/tasks/repositories/prisma-task.repository.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    CreateTaskService,
    FindTaskByUuidService,
    {
      provide: TaskRepository,
      useClass: PrismaTaskRepository,
    },
  ],
  exports: [TaskRepository, CreateTaskService, FindTaskByUuidService],
})
export class TasksModule {}
