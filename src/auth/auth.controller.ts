import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  type HttpRedirectResponse,
  HttpStatus,
  Inject,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';

import { authConfig } from '#src/auth/config/auth.config.js';
import { Authenticated } from '#src/auth/decorators/authenticated-session.decorator.js';
import { ResponseCookies } from '#src/auth/decorators/cookie-writer.decorator.js';
import { Public } from '#src/auth/decorators/public.decorator.js';
import { OidcLoginException } from '#src/auth/google-login/attempts/exceptions/oidc-login.exception.js';
import { CompleteOidcLoginService } from '#src/auth/google-login/attempts/services/complete-oidc-login/complete-oidc-login.service.js';
import { StartOidcLoginService } from '#src/auth/google-login/attempts/services/start-oidc-login/start-oidc-login.service.js';
import { SignInWithGoogleService } from '#src/auth/google-login/services/sign-in-with-google/sign-in-with-google.service.js';
import { CookieWriter } from '#src/auth/pipes/cookie-writer.pipe.js';
import { AuthMeResponse } from '#src/auth/responses/auth-me.response.js';
import { RevokeSessionService } from '#src/auth/sessions/services/revoke-session/revoke-session.service.js';
import type { AuthConfig } from '#src/auth/types/auth-config.type.js';
import type { AuthenticatedSession } from '#src/auth/types/authenticated-session.type.js';
import { AuthCookiesUtils } from '#src/auth/utils/auth-cookies/auth-cookies.utils.js';

const OIDC_STATE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly startOidcLogin: StartOidcLoginService,
    private readonly completeOidcLogin: CompleteOidcLoginService,
    private readonly signInWithGoogle: SignInWithGoogleService,
    private readonly revokeSession: RevokeSessionService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  @Public()
  @Get('google')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  async startGoogleLogin(
    @ResponseCookies() cookies: CookieWriter,
  ): Promise<HttpRedirectResponse> {
    const attempt = await this.startOidcLogin.execute();
    cookies.set(
      AuthCookiesUtils.nameFor('oidc_state', this.config.cookieSecure),
      attempt.state,
      OIDC_STATE_TTL_SECONDS,
      this.config.cookieSecure,
    );
    return { url: attempt.authorizationUrl.toString(), statusCode: 302 };
  }

  @Public()
  @Get('google/callback')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async completeGoogleLogin(
    @Query() query: Record<string, unknown>,
    @Headers('cookie') cookieHeader: string | undefined,
    @ResponseCookies() cookies: CookieWriter,
  ): Promise<HttpRedirectResponse> {
    const stateCookieName = AuthCookiesUtils.nameFor(
      'oidc_state',
      this.config.cookieSecure,
    );
    const browserState = AuthCookiesUtils.read(cookieHeader, stateCookieName);
    cookies.clear(stateCookieName, this.config.cookieSecure);

    const callbackUrl = new URL(this.config.google.redirectUri);
    for (const [key, values] of Object.entries(query)) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (typeof value !== 'string') throw new OidcLoginException();
        callbackUrl.searchParams.append(key, value);
      }
    }
    const identity = await this.completeOidcLogin.execute(
      callbackUrl,
      browserState ?? undefined,
    );
    const session = await this.signInWithGoogle.execute(identity);
    cookies.set(
      AuthCookiesUtils.nameFor('session', this.config.cookieSecure),
      session.token,
      SESSION_TTL_SECONDS,
      this.config.cookieSecure,
    );

    return {
      url: new URL('/', this.config.appOrigin).toString(),
      statusCode: 302,
    };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Authenticated() session: AuthenticatedSession): AuthMeResponse {
    return new AuthMeResponse(session.user.uuid, session.user.email);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Authenticated() session: AuthenticatedSession,
    @ResponseCookies() cookies: CookieWriter,
  ): Promise<void> {
    await this.revokeSession.execute(session.token);
    cookies.clear(
      AuthCookiesUtils.nameFor('session', this.config.cookieSecure),
      this.config.cookieSecure,
    );
  }
}
