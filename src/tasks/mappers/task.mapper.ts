import type { Prisma, Task } from '@prisma/client';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';
import type { CreateTaskData } from '#src/tasks/types/data/create-task.data.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';
import { TaskPriority } from '#src/tasks/types/enum/task-priority.enum.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

export class TaskMapper {
  static toEntity(task: Task): TaskEntity {
    return new TaskEntity(
      task.uuid,
      task.userUuid,
      task.parentUuid,
      task.name,
      task.description,
      TaskStatus[task.status],
      TaskPriority[task.priority],
      TaskDateMapper.fromData({
        date: task.startDate,
        hasTime: task.startHasTime,
      }),
      TaskDateMapper.fromData({
        date: task.endDate,
        hasTime: task.endHasTime,
      }),
      TaskDateMapper.fromData({
        date: task.reminderDate,
        hasTime: task.reminderHasTime,
      }),
      task.deletedAt,
    );
  }

  static toListEntity(tasks: Task[]): TaskEntity[] {
    return tasks.map((task) => this.toEntity(task));
  }

  static toCreateInput(data: CreateTaskData): Prisma.TaskUncheckedCreateInput {
    const start = TaskDateMapper.toData(data.start ?? null);
    const end = TaskDateMapper.toData(data.end ?? null);
    const reminder = TaskDateMapper.toData(data.reminder ?? null);

    return {
      userUuid: data.userUuid,
      parentUuid: data.parentUuid ?? null,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? TaskStatus.PENDING,
      priority: data.priority ?? TaskPriority.MEDIUM,
      startDate: start.date,
      startHasTime: start.hasTime,
      endDate: end.date,
      endHasTime: end.hasTime,
      reminderDate: reminder.date,
      reminderHasTime: reminder.hasTime,
    };
  }

  static toUpdateInput(data: UpdateTaskData): Prisma.TaskUpdateInput {
    const input: Prisma.TaskUpdateInput = {};

    if (data.name !== undefined) input.name = data.name;
    if (data.description !== undefined) input.description = data.description;
    if (data.status !== undefined) input.status = data.status;
    if (data.priority !== undefined) input.priority = data.priority;
    if (data.deletedAt !== undefined) input.deletedAt = data.deletedAt;

    if (data.start !== undefined) {
      const start = TaskDateMapper.toData(data.start);
      input.startDate = start.date;
      input.startHasTime = start.hasTime;
    }

    if (data.end !== undefined) {
      const end = TaskDateMapper.toData(data.end);
      input.endDate = end.date;
      input.endHasTime = end.hasTime;
    }

    if (data.reminder !== undefined) {
      const reminder = TaskDateMapper.toData(data.reminder);
      input.reminderDate = reminder.date;
      input.reminderHasTime = reminder.hasTime;
    }

    return input;
  }
}
