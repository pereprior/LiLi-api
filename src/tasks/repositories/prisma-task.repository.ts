import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '#src/database/prisma.service.js';
import type { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskNotFoundException } from '#src/tasks/exceptions/task-not-found.exception.js';
import { TaskMapper } from '#src/tasks/mappers/task.mapper.js';
import { TaskRepository } from '#src/tasks/repositories/task.repository.js';
import type { CreateTaskData } from '#src/tasks/types/data/create-task.data.js';
import type { UpdateTaskData } from '#src/tasks/types/data/update-task.data.js';

@Injectable()
export class PrismaTaskRepository extends TaskRepository {
  private transactionClient: Prisma.TransactionClient | null = null;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private get client(): Prisma.TransactionClient {
    return this.transactionClient ?? this.prisma;
  }

  override async transaction<T>(
    operation: (repository: TaskRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionClient !== null) return operation(this);

    try {
      return await this.prisma.$transaction(
        async (client) => {
          const repository = new PrismaTaskRepository(this.prisma);
          repository.transactionClient = client;
          return operation(repository);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          throw new TaskConflictException(
            'Task changed during this operation. Please retry.',
          );
        }
        if (error.code === 'P2025') throw new TaskNotFoundException();
      }
      throw error;
    }
  }

  override async create(data: CreateTaskData): Promise<TaskEntity> {
    const record = await this.client.task.create({
      data: TaskMapper.toCreateInput(data),
    });

    return TaskMapper.toEntity(record);
  }

  override async findAll(userUuid: string): Promise<TaskEntity[]> {
    const records = await this.client.task.findMany({
      where: { userUuid, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { uuid: 'asc' }],
    });

    return TaskMapper.toListEntity(records);
  }

  override async findByUuid(
    userUuid: string,
    uuid: string,
  ): Promise<TaskEntity | null> {
    const record = await this.client.task.findUnique({
      where: { uuid, userUuid, deletedAt: null },
    });

    return record === null ? null : TaskMapper.toEntity(record);
  }

  override async findSubtasks(
    userUuid: string,
    parentUuid: string,
  ): Promise<TaskEntity[]> {
    const records = await this.client.task.findMany({
      where: { userUuid, parentUuid, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { uuid: 'asc' }],
    });
    return TaskMapper.toListEntity(records);
  }

  override async update(
    userUuid: string,
    uuid: string,
    data: UpdateTaskData,
  ): Promise<TaskEntity> {
    const record = await this.client.task.update({
      where: { uuid, userUuid, deletedAt: null },
      data: TaskMapper.toUpdateInput(data),
    });

    return TaskMapper.toEntity(record);
  }

  override async delete(userUuid: string, uuid: string): Promise<void> {
    await this.client.task.delete({
      where: { uuid, userUuid, deletedAt: null },
    });
  }

  override async softDelete(userUuid: string, uuid: string): Promise<void> {
    if (this.transactionClient === null) {
      return this.transaction((repository) =>
        repository.softDelete(userUuid, uuid),
      );
    }

    const deletedAt = new Date();
    await this.client.task.update({
      where: { uuid, userUuid, deletedAt: null },
      data: { deletedAt },
    });
    await this.client.task.updateMany({
      where: { userUuid, parentUuid: uuid, deletedAt: null },
      data: { deletedAt },
    });
  }
}
