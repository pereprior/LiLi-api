import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '#src/database/prisma.service.js';
import {
  REMINDER_RECOVERY_WINDOW_MS,
  REMINDER_RESERVATION_DURATION_MS,
} from '#src/reminders/config/reminders.config.js';
import { ReminderEntity } from '#src/reminders/entities/reminder.entity.js';
import { ReminderRepository } from '#src/reminders/repositories/reminder.repository.js';
import { ReminderDateUtils } from '#src/reminders/utils/reminder-date.utils.js';
import { TaskDateMapper } from '#src/tasks/mappers/task-date.mapper.js';

const TASK_ELIGIBLE_FOR_REMINDER: Prisma.TaskWhereInput = {
  deletedAt: null,
  reminderDate: { not: null },
  status: { notIn: ['COMPLETED', 'CANCELLED'] },
};

@Injectable()
export class PrismaReminderRepository extends ReminderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async createMissingReminders(): Promise<void> {
    const legacyTasks = await this.prisma.task.findMany({
      where: { ...TASK_ELIGIBLE_FOR_REMINDER, notification: null },
      select: { uuid: true },
      take: 100,
    });

    for (const legacy of legacyTasks) {
      await this.prisma.$transaction(
        async (client) => {
          const task = await client.task.findFirst({
            where: {
              uuid: legacy.uuid,
              ...TASK_ELIGIBLE_FOR_REMINDER,
              notification: null,
            },
          });

          if (task === null) return;

          const reminder = TaskDateMapper.fromData({
            date: task.reminderDate,
            hasTime: task.reminderHasTime,
          });

          if (reminder === null) return;

          const dueAt = ReminderDateUtils.dueAt(reminder);

          await client.taskReminder.createMany({
            data: [{ taskUuid: task.uuid, dueAt, nextAttemptAt: dueAt }],
            skipDuplicates: true,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    }
  }

  override async cancelRemindersForIneligibleTasks(): Promise<void> {
    await this.prisma.taskReminder.updateMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        task: { isNot: TASK_ELIGIBLE_FOR_REMINDER },
      },
      data: { status: 'CANCELLED', claimToken: null, leaseUntil: null },
    });
  }

  override async expireOverdueReminders(now: Date): Promise<void> {
    const available = {
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    };

    await this.prisma.taskReminder.updateMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        dueAt: { lt: new Date(now.getTime() - REMINDER_RECOVERY_WINDOW_MS) },
        ...available,
      },
      data: { status: 'EXPIRED', claimToken: null, leaseUntil: null },
    });
  }

  override async failExhaustedInterruptedReminders(now: Date): Promise<void> {
    await this.prisma.taskReminder.updateMany({
      where: {
        status: 'PROCESSING',
        attempts: { gte: 5 },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: 'FAILED',
        lastError: 'INTERRUPTED',
        claimToken: null,
        leaseUntil: null,
      },
    });
  }

  override async reserveNextDueReminder(
    now: Date,
  ): Promise<ReminderEntity | null> {
    const where: Prisma.TaskReminderWhereInput = {
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: 5 },
      dueAt: {
        lte: now,
        gte: new Date(now.getTime() - REMINDER_RECOVERY_WINDOW_MS),
      },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      task: TASK_ELIGIBLE_FOR_REMINDER,
    };

    const candidates = await this.prisma.taskReminder.findMany({
      where,
      orderBy: [{ nextAttemptAt: 'asc' }, { uuid: 'asc' }],
      take: 25,
    });

    for (const candidate of candidates) {
      const claimToken = randomUUID();
      const result = await this.prisma.taskReminder.updateMany({
        where: { ...where, uuid: candidate.uuid },
        data: {
          status: 'PROCESSING',
          claimToken,
          leaseUntil: new Date(
            now.getTime() + REMINDER_RESERVATION_DURATION_MS,
          ),
          attempts: { increment: 1 },
        },
      });

      if (result.count === 0) continue;

      const record = await this.prisma.taskReminder.findFirst({
        where: { uuid: candidate.uuid, claimToken },
        include: { task: { include: { user: true } } },
      });

      if (record === null) continue;

      return new ReminderEntity(
        record.uuid,
        claimToken,
        record.attempts,
        record.dueAt,
        record.task.name,
        record.task.user.email,
      );
    }

    return null;
  }

  override async canSendReservedReminder(
    reminder: ReminderEntity,
    now: Date,
  ): Promise<boolean> {
    return (
      (await this.prisma.taskReminder.count({
        where: {
          uuid: reminder.uuid,
          claimToken: reminder.claimToken,
          status: 'PROCESSING',
          leaseUntil: { gt: now },
          dueAt: { gte: new Date(now.getTime() - REMINDER_RECOVERY_WINDOW_MS) },
          task: TASK_ELIGIBLE_FOR_REMINDER,
        },
      })) === 1
    );
  }

  override async saveAcceptedEmail(
    reminder: ReminderEntity,
    now: Date,
    messageId: string,
  ): Promise<void> {
    await this.prisma.taskReminder.updateMany({
      where: {
        uuid: reminder.uuid,
        claimToken: reminder.claimToken,
        status: 'PROCESSING',
      },
      data: {
        status: 'SENT',
        sentAt: now,
        messageId,
        lastError: null,
        claimToken: null,
        leaseUntil: null,
      },
    });
  }

  override async saveEmailFailure(
    reminder: ReminderEntity,
    reason: string,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    await this.prisma.taskReminder.updateMany({
      where: {
        uuid: reminder.uuid,
        claimToken: reminder.claimToken,
        status: 'PROCESSING',
      },
      data: {
        status: nextAttemptAt === null ? 'FAILED' : 'PENDING',
        lastError: reason,
        ...(nextAttemptAt === null ? {} : { nextAttemptAt }),
        claimToken: null,
        leaseUntil: null,
      },
    });
  }
}
