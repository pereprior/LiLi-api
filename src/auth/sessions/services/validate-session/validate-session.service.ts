import { Inject, Injectable } from '@nestjs/common';

import { authConfig } from '#src/auth/config/auth.config.js';
import { SessionException } from '#src/auth/sessions/exceptions/session.exception.js';
import type { AuthConfig } from '#src/auth/types/auth-config.type.js';
import { AuthSecretsUtils } from '#src/auth/utils/auth-secrets/auth-secrets.utils.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { AppLogger } from '#src/logging/app-logger.js';

@Injectable()
export class ValidateSessionService {
  private readonly logger = new AppLogger('ValidateSessionService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async execute(
    token: string,
  ): Promise<{ userUuid: string; email: string } | null> {
    this.logger.log('Starting session validation.');

    try {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash: AuthSecretsUtils.hash(token) },
        include: { user: true },
      });

      if (!session) {
        this.logger.warn('Rejected session validation.', {
          reason: 'Session not found.',
        });
        return null;
      }

      if (session.revokedAt !== null) {
        this.logger.warn('Rejected session validation.', {
          userUuid: session.userUuid,
          reason: 'Session is revoked.',
        });
        return null;
      }

      if (session.expiresAt <= new Date()) {
        this.logger.warn('Rejected session validation.', {
          userUuid: session.userUuid,
          reason: 'Session is expired.',
        });
        return null;
      }

      if (
        !this.config.google.allowedEmails.has(session.user.email.toLowerCase())
      ) {
        this.logger.warn('Rejected session validation.', {
          userUuid: session.userUuid,
          reason: 'User is no longer allowed.',
        });
        return null;
      }

      this.logger.log('Successfully validated session.', {
        userUuid: session.userUuid,
      });
      return { userUuid: session.userUuid, email: session.user.email };
    } catch (error) {
      this.logger.error('Failed to validate session.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new SessionException();
    }
  }
}
