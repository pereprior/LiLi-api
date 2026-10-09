import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { authConfig } from '#src/auth/config/auth.config.js';
import { OidcLoginException } from '#src/auth/google-login/attempts/exceptions/oidc-login.exception.js';
import { GoogleOidcClient } from '#src/auth/google-login/oidc/clients/google-oidc.client.js';
import type { AuthenticatedExternalIdentity } from '#src/auth/google-login/oidc/types/authenticated-external-identity.type.js';
import type { AuthConfig } from '#src/auth/types/auth-config.type.js';
import { AuthSecretsUtils } from '#src/auth/utils/auth-secrets/auth-secrets.utils.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { AppLogger } from '#src/logging/app-logger.js';

@Injectable()
export class CompleteOidcLoginService {
  private readonly logger = new AppLogger('CompleteOidcLoginService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly oidcClient: GoogleOidcClient,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async execute(
    callbackUrl: URL,
    browserState: string | undefined,
  ): Promise<AuthenticatedExternalIdentity> {
    this.logger.log('Starting OIDC login completion.');

    const expectedCallbackUrl = new URL(this.config.google.redirectUri);
    const states = callbackUrl.searchParams.getAll('state');
    if (
      callbackUrl.origin !== expectedCallbackUrl.origin ||
      callbackUrl.pathname !== expectedCallbackUrl.pathname ||
      states.length !== 1 ||
      !states[0] ||
      states[0] !== browserState
    ) {
      this.logger.warn('Rejected OIDC callback.', {
        reason: 'Invalid callback URL or browser state.',
      });
      throw new OidcLoginException();
    }

    let attempt;
    try {
      const now = new Date();
      const consumed = await this.prisma.oidcLoginAttempt.updateMany({
        where: {
          stateHash: AuthSecretsUtils.hash(states[0]),
          expiresAt: { gt: now },
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        this.logger.warn('Rejected OIDC login attempt.', {
          reason: 'Attempt is missing, expired or already consumed.',
        });
        throw new OidcLoginException();
      }

      attempt = await this.prisma.oidcLoginAttempt.findUniqueOrThrow({
        where: { stateHash: AuthSecretsUtils.hash(states[0]) },
      });
    } catch (error) {
      if (error instanceof OidcLoginException) throw error;
      this.logger.error('Failed to consume OIDC login attempt.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new ServiceUnavailableException('OIDC login is unavailable.');
    }

    try {
      this.logger.log('Consumed OIDC login attempt.', {
        attemptUuid: attempt.uuid,
      });
      const identity = await this.oidcClient.exchangeCode(callbackUrl, {
        state: states[0],
        nonce: attempt.nonce,
        codeVerifier: attempt.codeVerifier,
      });

      this.logger.log('Successfully completed OIDC login.', {
        attemptUuid: attempt.uuid,
        emailVerified: identity.emailVerified,
      });
      return identity;
    } catch (error) {
      this.logger.warn('Failed to verify OIDC identity.', {
        attemptUuid: attempt.uuid,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new OidcLoginException();
    }
  }
}
