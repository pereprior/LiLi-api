import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { authConfig } from '#src/auth/config/auth.config.js';
import type { AuthenticatedExternalIdentity } from '#src/auth/google-login/oidc/types/authenticated-external-identity.type.js';
import { CreateSessionService } from '#src/auth/sessions/services/create-session/create-session.service.js';
import type { CreatedSession } from '#src/auth/sessions/types/created-session.type.js';
import type { AuthConfig } from '#src/auth/types/auth-config.type.js';
import { PrismaService } from '#src/database/prisma.service.js';
import { AppLogger } from '#src/shared/logging/app-logger.js';

@Injectable()
export class SignInWithGoogleService {
  private readonly logger = new AppLogger('SignInWithGoogleService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly createSession: CreateSessionService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async execute(
    identity: AuthenticatedExternalIdentity,
  ): Promise<CreatedSession> {
    this.logger.log('Starting Google sign-in.');

    try {
      const email = identity.email.trim().toLowerCase();

      if (
        !identity.emailVerified ||
        !this.config.google.allowedEmails.has(email)
      ) {
        throw new ForbiddenException('Google account is not allowed.');
      }

      let user;
      try {
        user = await this.prisma.user.upsert({
          where: { googleSubject: identity.subject },
          create: { googleSubject: identity.subject, email },
          update: { email },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }

        this.logger.log(
          'Retrying Google user lookup after a uniqueness conflict.',
        );
        user = await this.prisma.user.update({
          where: { googleSubject: identity.subject },
          data: { email },
        });
      }

      const session = await this.createSession.execute(user.uuid);

      this.logger.log('Successfully signed in with Google.', {
        userUuid: user.uuid,
      });
      return session;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        this.logger.warn('Rejected Google sign-in.', {
          reason: error.message,
          statusCode: error.getStatus(),
        });
      } else {
        this.logger.error('Failed to sign in with Google.', undefined, {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
      throw error;
    }
  }
}
