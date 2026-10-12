import { forwardRef, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ActionExceptionFilter } from '#src/actions/filters/action-exception.filter.js';
import { TaskActions } from '#src/actions/modules/tasks/task-actions.js';
import { LiliService } from '#src/actions/services/lili/lili.service.js';
import {
  ACTION_HANDLERS,
  type ActionHandlers,
} from '#src/actions/types/action-contracts.type.js';
import { TasksModule } from '#src/tasks/tasks.module.js';

@Module({
  imports: [forwardRef(() => TasksModule)],
  providers: [
    TaskActions,
    LiliService,
    {
      provide: ACTION_HANDLERS,
      inject: [TaskActions],
      useFactory: (tasks: TaskActions): ActionHandlers => tasks.handlers,
    },
    { provide: APP_FILTER, useClass: ActionExceptionFilter },
  ],
  exports: [LiliService],
})
export class ActionsModule {}
