import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { GoogleOidcClient } from '#src/auth/google-login/oidc/clients/google-oidc.client.js';
import { AuthSecretsUtils } from '#src/auth/utils/auth-secrets/auth-secrets.utils.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { AppLogger } from '#src/logging/app-logger.js';

const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class StartOidcLoginService {
  private readonly logger = new AppLogger('StartOidcLoginService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly oidcClient: GoogleOidcClient,
  ) {}

  async execute(): Promise<{ authorizationUrl: URL; state: string }> {
    this.logger.log('Starting OIDC login attempt.');

    const state = AuthSecretsUtils.generate();
    const nonce = AuthSecretsUtils.generate();
    const codeVerifier = AuthSecretsUtils.generate();

    try {
      const authorizationUrl = await this.oidcClient.createAuthorizationUrl({
        state,
        nonce,
        codeVerifier,
      });

      const attempt = await this.prisma.oidcLoginAttempt.create({
        data: {
          stateHash: AuthSecretsUtils.hash(state),
          nonce,
          codeVerifier,
          expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS),
        },
      });

      this.logger.log('Successfully started OIDC login attempt.', {
        attemptUuid: attempt.uuid,
      });
      return { authorizationUrl, state };
    } catch (error) {
      this.logger.error('Failed to start OIDC login attempt.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new ServiceUnavailableException('OIDC login is unavailable.');
    }
  }
}
