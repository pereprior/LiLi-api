import { HttpAdapterHost } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionValidationError } from '#src/actions/errors/action-validation.error.js';
import { UnknownActionError } from '#src/actions/errors/unknown-action.error.js';
import { ActionExceptionFilter } from '#src/actions/filters/action-exception.filter.js';

describe('ActionExceptionFilter', () => {
  let module: TestingModule;
  let filter: ActionExceptionFilter;
  const reply =
    vi.fn<(response: object, body: object, status: number) => void>();

  beforeEach(async () => {
    reply.mockReset();
    module = await Test.createTestingModule({
      providers: [
        ActionExceptionFilter,
        {
          provide: HttpAdapterHost,
          useValue: {
            httpAdapter: { reply, isHeadersSent: (): boolean => false },
          },
        },
      ],
    }).compile();
    filter = module.get(ActionExceptionFilter);
  });

  afterEach(async () => {
    await module.close();
  });

  it.each([
    [
      new ActionValidationError(['userUuid must be a UUID']),
      400,
      {
        statusCode: 400,
        error: 'Bad Request',
        message: ['userUuid must be a UUID'],
      },
    ],
    [
      new UnknownActionError(),
      400,
      { statusCode: 400, error: 'Bad Request', message: 'Unknown action.' },
    ],
  ])('maps %s to its HTTP status and public body', (error, status, body) => {
    const response = {};
    const host = new ExecutionContextHost([{}, response]);

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledExactlyOnceWith(response, body, status);
  });
});
