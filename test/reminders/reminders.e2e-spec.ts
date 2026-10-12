import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '#src/database/prisma.service.js';
import { ReminderEmailClient } from '#src/reminders/clients/reminder-email.client.js';
import { ReminderEmailError } from '#src/reminders/errors/reminder-email.error.js';
import { RemindersModule } from '#src/reminders/reminders.module.js';
import { ReminderRepository } from '#src/reminders/repositories/reminder.repository.js';
import { SendPendingRemindersService } from '#src/reminders/services/send-pending-reminders/send-pending-reminders.service.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';
import { TasksModule } from '#src/tasks/tasks.module.js';
import { TaskStatus } from '#src/tasks/types/enum/task-status.enum.js';

describe('Reminder delivery and recovery', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let create: CreateTaskService;
  let update: UpdateTaskDetailsService;
  let updateStatus: UpdateTaskStatusService;
  let remove: DeleteTaskService;
  let repository: ReminderRepository;
  let worker: SendPendingRemindersService;
  let userUuid: string;
  const send = vi.fn<ReminderEmailClient['send']>();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TasksModule,
        RemindersModule,
      ],
    })
      .overrideProvider(ReminderEmailClient)
      .useValue({ send })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    create = module.get(CreateTaskService);
    update = module.get(UpdateTaskDetailsService);
    updateStatus = module.get(UpdateTaskStatusService);
    remove = module.get(DeleteTaskService);
    repository = module.get(ReminderRepository);
    worker = module.get(SendPendingRemindersService);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T18:00:00Z'));
    send.mockReset().mockResolvedValue('smtp-id');
    await prisma.task.deleteMany({
      where: { user: { googleSubject: 'reminders-owner' } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: 'reminders-owner' },
    });
    const user = await prisma.user.create({
      data: { googleSubject: 'reminders-owner', email: 'owner@example.com' },
    });
    userUuid = user.uuid;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await prisma.task.deleteMany({
      where: { user: { googleSubject: 'reminders-owner' } },
    });
    await prisma.user.deleteMany({
      where: { googleSubject: 'reminders-owner' },
    });
    await module.close();
  });

  describe('Due reminders', () => {
    it('sends to the Google account email and does not resend on the next pass', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );

      await worker.execute();
      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          taskName: 'Bins',
          recipient: 'owner@example.com',
        }),
      );
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({
        status: 'SENT',
        attempts: 1,
        messageId: 'smtp-id',
        sentAt: new Date(),
      });
    });

    it('does not send before the scheduled time', async () => {
      await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:01' },
      );

      await worker.execute();

      expect(send).not.toHaveBeenCalled();
    });

    it('sends a date-only reminder at 06:00 Madrid', async () => {
      await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-12' },
      );
      vi.setSystemTime(new Date('2026-10-12T03:59:59Z'));

      await worker.execute();
      expect(send).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-10-12T04:00:00Z'));
      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
    });

    it('recovers a late reminder within 24 hours', async () => {
      await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-10T20:00' },
      );

      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
    });

    it('expires a reminder older than 24 hours', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-10T19:59' },
      );

      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({ status: 'EXPIRED', attempts: 0 });
    });

    it('recovers reminders on tasks created before the migration', async () => {
      const task = await prisma.task.create({
        data: {
          userUuid,
          name: 'Legacy bins',
          reminderDate: new Date('2026-10-11T18:00:00Z'),
          reminderHasTime: true,
        },
      });

      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({ status: 'SENT' });
    });
  });

  describe('Retries and leases', () => {
    it('persists a retry and waits until it is due', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      send.mockRejectedValueOnce(
        new ReminderEmailError('SMTP_TEMPORARY', true),
      );

      await worker.execute();
      await worker.execute();
      expect(send).toHaveBeenCalledOnce();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        nextAttemptAt: new Date('2026-10-11T18:01:00Z'),
      });
      vi.setSystemTime(new Date('2026-10-11T18:01:00Z'));
      await worker.execute();

      expect(send).toHaveBeenCalledTimes(2);
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({ status: 'SENT', attempts: 2 });
    });

    it('keeps a permanent failure for inspection', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      send.mockRejectedValueOnce(
        new ReminderEmailError('AUTHENTICATION', false),
      );

      await worker.execute();
      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({ status: 'FAILED', lastError: 'AUTHENTICATION' });
    });

    it('does not reserve a reminder while another reservation is live', async () => {
      await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      const claimed = await repository.reserveNextDueReminder(new Date());
      expect(claimed).not.toBeNull();

      await worker.execute();

      expect(send).not.toHaveBeenCalled();
    });

    it('only grants one reservation when two claims overlap', async () => {
      await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );

      const results = await Promise.all([
        repository.reserveNextDueReminder(new Date()),
        repository.reserveNextDueReminder(new Date()),
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
    });

    it('recovers an expired reservation and rejects its stale acknowledgement', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      const previous = await repository.reserveNextDueReminder(new Date());
      if (previous === null) throw new Error('Expected a reservation');
      vi.setSystemTime(new Date('2026-10-11T18:05:00Z'));
      const recovered = await repository.reserveNextDueReminder(new Date());
      if (recovered === null) throw new Error('Expected recovery');

      await repository.saveAcceptedEmail(previous, new Date(), 'stale-id');

      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({
        status: 'PROCESSING',
        claimToken: recovered.claimToken,
        attempts: 2,
        messageId: null,
      });
    });

    it('stops recovering a fifth interrupted attempt', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      await prisma.taskReminder.update({
        where: { taskUuid: task.uuid },
        data: {
          status: 'PROCESSING',
          attempts: 5,
          leaseUntil: new Date('2026-10-11T17:59:00Z'),
        },
      });

      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({ status: 'FAILED', lastError: 'INTERRUPTED' });
    });
  });

  describe('Task changes', () => {
    it('sends a new reminder after changing the date of an accepted one', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      await worker.execute();

      await update.execute(
        { uuid: userUuid },
        { uuid: task.uuid },
        { reminder: '2026-10-11T20:30' },
      );
      vi.setSystemTime(new Date('2026-10-11T18:30:00Z'));
      await worker.execute();

      expect(send).toHaveBeenCalledTimes(2);
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({
        status: 'SENT',
        attempts: 1,
        dueAt: new Date('2026-10-11T18:30:00Z'),
      });
    });
    it('replaces a reminder when its date changes', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      const previous = await repository.reserveNextDueReminder(new Date());
      if (previous === null) throw new Error('Expected a reservation');

      await update.execute(
        { uuid: userUuid },
        { uuid: task.uuid },
        { reminder: '2026-10-11T20:30' },
      );
      await repository.saveAcceptedEmail(previous, new Date(), 'old-id');
      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.findUniqueOrThrow({
          where: { taskUuid: task.uuid },
        }),
      ).toMatchObject({
        status: 'PENDING',
        attempts: 0,
        messageId: null,
        dueAt: new Date('2026-10-11T18:30:00Z'),
      });
    });

    it('does not rearm a sent reminder when the same date is submitted', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      await worker.execute();

      await update.execute(
        { uuid: userUuid },
        { uuid: task.uuid },
        { reminder: '2026-10-11T20:00', name: 'Renamed bins' },
      );
      await worker.execute();

      expect(send).toHaveBeenCalledOnce();
    });

    it('removes the pending notification when the reminder is cleared', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );

      await update.execute(
        { uuid: userUuid },
        { uuid: task.uuid },
        { reminder: null },
      );
      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.count({ where: { taskUuid: task.uuid } }),
      ).toBe(0);
    });

    it.each([TaskStatus.COMPLETED, TaskStatus.CANCELLED])(
      'cancels pending delivery on a %s task',
      async (status) => {
        const task = await create.execute(
          { uuid: userUuid },
          { name: 'Bins', reminder: '2026-10-11T20:00' },
        );

        await updateStatus.execute(
          { uuid: userUuid },
          { uuid: task.uuid },
          { status },
        );
        await worker.execute();

        expect(send).not.toHaveBeenCalled();
        expect(
          await prisma.taskReminder.findUniqueOrThrow({
            where: { taskUuid: task.uuid },
          }),
        ).toMatchObject({ status: 'CANCELLED' });
      },
    );

    it('cancels reminders when a task and its subtasks are archived', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );
      const child = await create.execute(
        { uuid: userUuid },
        { name: 'Child', parentUuid: task.uuid, reminder: '2026-10-11T20:00' },
      );
      await updateStatus.execute(
        { uuid: userUuid },
        { uuid: task.uuid },
        { status: TaskStatus.IN_PROGRESS },
      );

      await remove.execute({ uuid: userUuid }, { uuid: task.uuid });
      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.findMany({
          where: { taskUuid: { in: [task.uuid, child.uuid] } },
          select: { status: true },
        }),
      ).toEqual([{ status: 'CANCELLED' }, { status: 'CANCELLED' }]);
    });

    it('deletes the delivery record with a pending task', async () => {
      const task = await create.execute(
        { uuid: userUuid },
        { name: 'Bins', reminder: '2026-10-11T20:00' },
      );

      await remove.execute({ uuid: userUuid }, { uuid: task.uuid });
      await worker.execute();

      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.taskReminder.count({ where: { taskUuid: task.uuid } }),
      ).toBe(0);
    });
  });
});
