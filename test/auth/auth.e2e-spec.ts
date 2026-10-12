import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '#src/app.module.js';
import { GoogleOidcClient } from '#src/auth/google-login/oidc/clients/google-oidc.client.js';
import type { AuthenticatedExternalIdentity } from '#src/auth/google-login/oidc/types/authenticated-external-identity.type.js';
import { configureApp } from '#src/config/app.config.js';
import { PrismaService } from '#src/database/prisma.service.js';

const allowedIdentity: AuthenticatedExternalIdentity = {
  subject: 'google-subject-1',
  email: 'member@example.com',
  emailVerified: true,
};

describe('Google login and local sessions', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  const createAuthorizationUrl =
    vi.fn<GoogleOidcClient['createAuthorizationUrl']>();
  const exchangeCode = vi.fn<GoogleOidcClient['exchangeCode']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleOidcClient)
      .useValue({ createAuthorizationUrl, exchangeCode })
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.oidcLoginAttempt.deleteMany();
    await prisma.user.deleteMany();

    createAuthorizationUrl.mockReset();
    exchangeCode.mockReset();
    createAuthorizationUrl.mockImplementation(({ state }) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('state', state);
      return Promise.resolve(url);
    });
    exchangeCode.mockResolvedValue(allowedIdentity);
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.oidcLoginAttempt.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('GET /auth/google', () => {
    it('starts OIDC with a temporary browser cookie', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      expect(stateCookie).toBe('lili_oidc_state=' + state);

      const cookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='));

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(await prisma.oidcLoginAttempt.count()).toBe(1);
    });
  });

  describe('GET /auth/google/callback', () => {
    it('creates an authenticated session for an allowed Google identity', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!sessionCookie)
        throw new Error('Login callback must return a session cookie.');

      const me = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: sessionCookie },
      });

      expect(me.status).toBe(200);

      const user = await prisma.user.findUniqueOrThrow({
        where: { googleSubject: allowedIdentity.subject },
      });

      expect(await me.json()).toEqual({
        uuid: user.uuid,
        email: 'member@example.com',
      });

      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.session.count()).toBe(1);
    });

    it('redirects a successful callback to the frontend root at the configured origin', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe('http://localhost:3000/');
    });

    it('prevents caching of a successful callback', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);
      expect(callback.headers.get('cache-control')).toBe('no-store');
    });

    it('clears the temporary browser cookie after a successful callback', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const cookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='));

      expect(cookie).toContain('lili_oidc_state=;');
      expect(cookie).toContain('Max-Age=0');
    });

    it('sets an HttpOnly session cookie with SameSite Lax and a seven-day lifetime', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const cookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='));

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Max-Age=604800');
    });

    it('reuses the same user for later logins of the same Google subject', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!sessionCookie)
        throw new Error('Login callback must return a session cookie.');

      const firstMe = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: sessionCookie },
      });

      expect(firstMe.status).toBe(200);

      const firstUser = (await firstMe.json()) as {
        uuid: string;
        email: string;
      };

      const secondStart = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(secondStart.status).toBe(302);

      const secondLocation = secondStart.headers.get('location');
      const secondStateCookie = secondStart.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!secondLocation || !secondStateCookie)
        throw new Error(
          'Second login start must return a redirect and state cookie.',
        );
      const secondState = new URL(secondLocation).searchParams.get('state');
      if (!secondState)
        throw new Error('Second authorization URL must contain state.');

      const secondCallbackUrl = new URL('/auth/google/callback', baseUrl);
      secondCallbackUrl.searchParams.set('state', secondState);
      secondCallbackUrl.searchParams.set('code', 'test-code');
      const secondCallback = await fetch(secondCallbackUrl, {
        headers: { cookie: secondStateCookie },
        redirect: 'manual',
      });

      expect(secondCallback.status).toBe(302);

      const secondSessionCookie = secondCallback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!secondSessionCookie)
        throw new Error('Second login callback must return a session cookie.');

      const secondMe = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: secondSessionCookie },
      });

      expect(secondMe.status).toBe(200);
      expect(await secondMe.json()).toEqual(firstUser);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.session.count()).toBe(2);
    });

    it('updates and normalizes the email on a later login of the same Google subject', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!sessionCookie)
        throw new Error('Login callback must return a session cookie.');

      const firstMe = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: sessionCookie },
      });

      expect(firstMe.status).toBe(200);

      const firstUser = (await firstMe.json()) as {
        uuid: string;
        email: string;
      };

      exchangeCode.mockResolvedValue({
        ...allowedIdentity,
        email: 'ADMIN@example.com',
      });
      const secondStart = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(secondStart.status).toBe(302);

      const secondLocation = secondStart.headers.get('location');
      const secondStateCookie = secondStart.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!secondLocation || !secondStateCookie)
        throw new Error(
          'Second login start must return a redirect and state cookie.',
        );
      const secondState = new URL(secondLocation).searchParams.get('state');
      if (!secondState)
        throw new Error('Second authorization URL must contain state.');

      const secondCallbackUrl = new URL('/auth/google/callback', baseUrl);
      secondCallbackUrl.searchParams.set('state', secondState);
      secondCallbackUrl.searchParams.set('code', 'test-code');
      const secondCallback = await fetch(secondCallbackUrl, {
        headers: { cookie: secondStateCookie },
        redirect: 'manual',
      });

      expect(secondCallback.status).toBe(302);

      const secondSessionCookie = secondCallback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!secondSessionCookie)
        throw new Error('Second login callback must return a session cookie.');

      const secondMe = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: secondSessionCookie },
      });

      expect(secondMe.status).toBe(200);
      expect(await secondMe.json()).toEqual({
        uuid: firstUser.uuid,
        email: 'admin@example.com',
      });

      expect(await prisma.user.count()).toBe(1);
    });

    it.each([
      {
        reason: 'unverified email',
        identity: { ...allowedIdentity, emailVerified: false },
      },
      {
        reason: 'disallowed email',
        identity: { ...allowedIdentity, email: 'outside@example.com' },
      },
    ])(
      'rejects an identity with $reason without creating a user or session',
      async ({ identity }) => {
        exchangeCode.mockResolvedValue(identity);

        const start = await fetch(new URL('/auth/google', baseUrl), {
          redirect: 'manual',
        });

        expect(start.status).toBe(302);

        const location = start.headers.get('location');
        const stateCookie = start.headers
          .getSetCookie()
          .find((cookie) => cookie.startsWith('lili_oidc_state='))
          ?.split(';')[0];

        if (!location || !stateCookie)
          throw new Error(
            'Login start must return a redirect and state cookie.',
          );

        const state = new URL(location).searchParams.get('state');
        if (!state) throw new Error('Authorization URL must contain state.');

        const callbackUrl = new URL('/auth/google/callback', baseUrl);
        callbackUrl.searchParams.set('state', state);
        callbackUrl.searchParams.set('code', 'test-code');

        const callback = await fetch(callbackUrl, {
          headers: { cookie: stateCookie },
          redirect: 'manual',
        });

        expect(callback.status).toBe(403);
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.session.count()).toBe(0);
      },
    );

    it('rejects a callback with mismatched browser state and clears the temporary cookie', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: 'lili_oidc_state=wrong' },
        redirect: 'manual',
      });

      expect(callback.status).toBe(400);

      const cookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='));

      expect(cookie).toContain('lili_oidc_state=;');
      expect(cookie).toContain('Max-Age=0');
      expect(exchangeCode).not.toHaveBeenCalled();
      expect(await prisma.session.count()).toBe(0);
    });

    it('rejects a callback with duplicate state parameters', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.append('state', state);
      callbackUrl.searchParams.append('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(400);
      expect(exchangeCode).not.toHaveBeenCalled();
      expect(await prisma.session.count()).toBe(0);
    });

    it('creates one user and two sessions when two callbacks for the same subject are sent together', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const secondStart = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(secondStart.status).toBe(302);

      const secondLocation = secondStart.headers.get('location');
      const secondStateCookie = secondStart.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!secondLocation || !secondStateCookie)
        throw new Error(
          'Second login start must return a redirect and state cookie.',
        );
      const secondState = new URL(secondLocation).searchParams.get('state');
      if (!secondState)
        throw new Error('Second authorization URL must contain state.');

      const firstCallbackUrl = new URL('/auth/google/callback', baseUrl);
      firstCallbackUrl.searchParams.set('state', state);
      firstCallbackUrl.searchParams.set('code', 'test-code');
      const secondCallbackUrl = new URL('/auth/google/callback', baseUrl);
      secondCallbackUrl.searchParams.set('state', secondState);
      secondCallbackUrl.searchParams.set('code', 'test-code');

      const callbacks = await Promise.all([
        fetch(firstCallbackUrl, {
          headers: { cookie: stateCookie },
          redirect: 'manual',
        }),
        fetch(secondCallbackUrl, {
          headers: { cookie: secondStateCookie },
          redirect: 'manual',
        }),
      ]);

      expect(callbacks.map((response) => response.status)).toEqual([302, 302]);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.session.count()).toBe(2);
    });
  });

  describe('GET /auth/me', () => {
    it('rejects an account request without a session cookie', async () => {
      const response = await fetch(new URL('/auth/me', baseUrl));

      expect(response.status).toBe(401);
    });

    it('rejects an account request with an invalid session cookie', async () => {
      const response = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: 'lili_session=invalid' },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears its cookie on logout', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!sessionCookie)
        throw new Error('Login callback must return a session cookie.');

      const logout = await fetch(new URL('/auth/logout', baseUrl), {
        method: 'POST',
        headers: { cookie: sessionCookie, origin: 'http://localhost:3000' },
      });

      expect(logout.status).toBe(204);

      const cookie = logout.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='));

      expect(cookie).toContain('lili_session=;');
      expect(cookie).toContain('Max-Age=0');

      const me = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: sessionCookie },
      });

      expect(me.status).toBe(401);
    });

    it.each([
      { reason: 'missing Origin and Referer', origin: undefined },
      { reason: 'foreign Origin', origin: 'https://evil.example' },
      {
        reason: 'Origin with a misleading hostname prefix',
        origin: 'http://localhost:3000.evil.example',
      },
    ])(
      'rejects logout with $reason and keeps the session active',
      async ({ origin }) => {
        const start = await fetch(new URL('/auth/google', baseUrl), {
          redirect: 'manual',
        });

        expect(start.status).toBe(302);

        const location = start.headers.get('location');
        const stateCookie = start.headers
          .getSetCookie()
          .find((cookie) => cookie.startsWith('lili_oidc_state='))
          ?.split(';')[0];

        if (!location || !stateCookie)
          throw new Error(
            'Login start must return a redirect and state cookie.',
          );

        const state = new URL(location).searchParams.get('state');
        if (!state) throw new Error('Authorization URL must contain state.');

        const callbackUrl = new URL('/auth/google/callback', baseUrl);
        callbackUrl.searchParams.set('state', state);
        callbackUrl.searchParams.set('code', 'test-code');

        const callback = await fetch(callbackUrl, {
          headers: { cookie: stateCookie },
          redirect: 'manual',
        });

        expect(callback.status).toBe(302);

        const sessionCookie = callback.headers
          .getSetCookie()
          .find((cookie) => cookie.startsWith('lili_session='))
          ?.split(';')[0];

        if (!sessionCookie)
          throw new Error('Login callback must return a session cookie.');

        const headers: Record<string, string> = { cookie: sessionCookie };
        if (origin !== undefined) headers.origin = origin;

        const logout = await fetch(new URL('/auth/logout', baseUrl), {
          method: 'POST',
          headers,
        });

        expect(logout.status).toBe(403);

        const me = await fetch(new URL('/auth/me', baseUrl), {
          headers: { cookie: sessionCookie },
        });

        expect(me.status).toBe(200);
      },
    );

    it('accepts same-origin Referer for logout when Origin is absent', async () => {
      const start = await fetch(new URL('/auth/google', baseUrl), {
        redirect: 'manual',
      });

      expect(start.status).toBe(302);

      const location = start.headers.get('location');
      const stateCookie = start.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_oidc_state='))
        ?.split(';')[0];

      if (!location || !stateCookie)
        throw new Error('Login start must return a redirect and state cookie.');

      const state = new URL(location).searchParams.get('state');
      if (!state) throw new Error('Authorization URL must contain state.');

      const callbackUrl = new URL('/auth/google/callback', baseUrl);
      callbackUrl.searchParams.set('state', state);
      callbackUrl.searchParams.set('code', 'test-code');

      const callback = await fetch(callbackUrl, {
        headers: { cookie: stateCookie },
        redirect: 'manual',
      });

      expect(callback.status).toBe(302);

      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('lili_session='))
        ?.split(';')[0];

      if (!sessionCookie)
        throw new Error('Login callback must return a session cookie.');

      const logout = await fetch(new URL('/auth/logout', baseUrl), {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          referer: 'http://localhost:3000/tasks',
        },
      });

      expect(logout.status).toBe(204);

      const me = await fetch(new URL('/auth/me', baseUrl), {
        headers: { cookie: sessionCookie },
      });

      expect(me.status).toBe(401);
    });
  });

  describe('Unavailable user routes', () => {
    it.each([
      ['GET', '/auth/users'],
      ['POST', '/auth/users'],
      ['PATCH', '/auth/users/any'],
      ['DELETE', '/auth/users/any'],
    ])('%s %s remains unavailable', async (method, path) => {
      const response = await fetch(new URL(path, baseUrl), { method });
      expect(response.status).toBe(404);
    });
  });
});
