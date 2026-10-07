import { Module } from '@nestjs/common';

import { DatabaseModule } from '#src/database/database.module.js';
import { PrismaTaskRepository } from '#src/tasks/repositories/prisma-task.repository.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: TaskRepository,
      useClass: PrismaTaskRepository,
    },
  ],
  exports: [TaskRepository],
})
export class TasksModule {}
