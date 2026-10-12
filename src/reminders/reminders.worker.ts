import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';

import { remindersConfig } from '#src/reminders/config/reminders.config.js';
import { SendPendingRemindersService } from '#src/reminders/services/send-pending-reminders/send-pending-reminders.service.js';
import type { RemindersConfig } from '#src/reminders/types/reminders-config.type.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';

@Injectable()
export class RemindersWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new AppLogger('RemindersWorker');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(remindersConfig.KEY) private readonly config: RemindersConfig,
    private readonly sendPending: SendPendingRemindersService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private start(): void {
    this.running = this.sendPending
      .execute()
      .catch((error: unknown) => {
        this.logger.error('Failed to process reminders.', undefined, {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      })
      .finally(() => {
        if (!this.stopped) this.timer = setTimeout(() => this.start(), 30_000);
      });
  }
}
