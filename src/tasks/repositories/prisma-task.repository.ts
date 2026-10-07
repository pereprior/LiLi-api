import { Injectable } from '@nestjs/common';

import { PrismaService } from '#src/database/prisma.service.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskMapper } from '#src/tasks/mappers/task.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import type { CreateTaskData } from '#src/tasks/types/data/create-task.data.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';

@Injectable()
export class PrismaTaskRepository extends TaskRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async create(data: CreateTaskData): Promise<TaskEntity> {
    const record = await this.prisma.task.create({
      data: TaskMapper.toCreateInput(data),
    });

    return TaskMapper.toEntity(record);
  }

  override async findAll(userUuid: string): Promise<TaskEntity[]> {
    const records = await this.prisma.task.findMany({
      where: { userUuid, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return TaskMapper.toListEntity(records);
  }

  override async findByUuid(
    userUuid: string,
    uuid: string,
  ): Promise<TaskEntity | null> {
    const record = await this.prisma.task.findUnique({
      where: { uuid, userUuid, deletedAt: null },
    });

    return record === null ? null : TaskMapper.toEntity(record);
  }

  override async update(
    userUuid: string,
    uuid: string,
    data: UpdateTaskData,
  ): Promise<TaskEntity> {
    const record = await this.prisma.task.update({
      where: { uuid, userUuid, deletedAt: null },
      data: TaskMapper.toUpdateInput(data),
    });

    return TaskMapper.toEntity(record);
  }

  override async delete(userUuid: string, uuid: string): Promise<void> {
    await this.prisma.task.delete({
      where: { uuid, userUuid, deletedAt: null },
    });
  }
}
