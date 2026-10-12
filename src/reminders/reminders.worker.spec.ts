import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { remindersConfig } from '#src/reminders/config/reminders.config.js';
import { RemindersWorker } from '#src/reminders/reminders.worker.js';
import { SendPendingRemindersService } from '#src/reminders/services/send-pending-reminders/send-pending-reminders.service.js';

describe('RemindersWorker', () => {
  let module: TestingModule;
  let worker: RemindersWorker;
  const config = { enabled: true };
  const execute = vi.fn<SendPendingRemindersService['execute']>();

  beforeEach(async () => {
    vi.useFakeTimers();
    config.enabled = true;
    execute.mockReset().mockResolvedValue(undefined);
    module = await Test.createTestingModule({
      providers: [
        RemindersWorker,
        { provide: remindersConfig.KEY, useValue: config },
        { provide: SendPendingRemindersService, useValue: { execute } },
      ],
    }).compile();
    worker = module.get(RemindersWorker);
  });

  afterEach(async () => {
    await module.close();
    vi.useRealTimers();
  });

  it('starts a pass on bootstrap', () => {
    worker.onApplicationBootstrap();

    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps disabled applications idle', async () => {
    config.enabled = false;

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(execute).not.toHaveBeenCalled();
  });

  it('waits for each pass before scheduling another', async () => {
    const pending = Promise.withResolvers<void>();
    execute.mockReturnValueOnce(pending.promise);
    worker.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(execute).toHaveBeenCalledOnce();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('continues after a processing failure', async () => {
    execute.mockRejectedValueOnce(new Error('Database unavailable'));
    worker.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('stops scheduling when the application closes', async () => {
    worker.onApplicationBootstrap();

    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(execute).toHaveBeenCalledOnce();
  });
});
