import { Injectable } from '@nestjs/common';

import { SessionException } from '#src/auth/sessions/exceptions/session.exception.js';
import { SessionUserUnavailableException } from '#src/auth/sessions/exceptions/session-user-unavailable.exception.js';
import type { CreatedSession } from '#src/auth/sessions/types/created-session.type.js';
import { AuthSecretsUtils } from '#src/auth/utils/auth-secrets/auth-secrets.utils.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { PrismaErrorUtils } from '#src/database/utils/prisma-error.utils.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CreateSessionService {
  private readonly logger = new AppLogger('CreateSessionService');

  constructor(private readonly prisma: PrismaService) {}

  async execute(userUuid: string): Promise<CreatedSession> {
    this.logger.log('Starting session creation.', { userUuid });

    try {
      const token = AuthSecretsUtils.generate();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      await this.prisma.session.create({
        data: {
          tokenHash: AuthSecretsUtils.hash(token),
          expiresAt,
          user: { connect: { uuid: userUuid } },
        },
      });

      this.logger.log('Successfully created session.', { userUuid, expiresAt });
      return { token, expiresAt };
    } catch (error) {
      if (PrismaErrorUtils.isRecordNotFoundError(error)) {
        this.logger.warn('Rejected session creation.', {
          userUuid,
          reason: 'User is unavailable.',
        });
        throw new SessionUserUnavailableException();
      }

      this.logger.error('Failed to create session.', undefined, {
        userUuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new SessionException();
    }
  }
}
