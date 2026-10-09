import { Injectable } from '@nestjs/common';

import { SessionException } from '#src/auth/sessions/exceptions/session.exception.js';
import { AuthSecretsUtils } from '#src/auth/utils/auth-secrets/auth-secrets.utils.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';

@Injectable()
export class RevokeSessionService {
  private readonly logger = new AppLogger('RevokeSessionService');

  constructor(private readonly prisma: PrismaService) {}

  async execute(token: string): Promise<void> {
    this.logger.log('Starting session revocation.');

    try {
      const revoked = await this.prisma.session.updateMany({
        where: { tokenHash: AuthSecretsUtils.hash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });

      this.logger.log('Successfully completed session revocation.', {
        revokedCount: revoked.count,
      });
    } catch (error) {
      this.logger.error('Failed to revoke session.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new SessionException();
    }
  }
}
