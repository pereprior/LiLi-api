import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '#src/database/database.module.js';
import { GmailReminderEmailClient } from '#src/reminders/clients/gmail/gmail-reminder-email.client.js';
import { ReminderEmailClient } from '#src/reminders/clients/reminder-email.client.js';
import { remindersConfig } from '#src/reminders/config/reminders.config.js';
import { RemindersWorker } from '#src/reminders/reminders.worker.js';
import { PrismaReminderRepository } from '#src/reminders/repositories/prisma-reminder.repository.js';
import { ReminderRepository } from '#src/reminders/repositories/reminder.repository.js';
import { SendPendingRemindersService } from '#src/reminders/services/send-pending-reminders/send-pending-reminders.service.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(remindersConfig)],
  providers: [
    RemindersWorker,
    SendPendingRemindersService,
    { provide: ReminderRepository, useClass: PrismaReminderRepository },
    { provide: ReminderEmailClient, useClass: GmailReminderEmailClient },
  ],
  exports: [SendPendingRemindersService, ReminderRepository],
})
export class RemindersModule {}
