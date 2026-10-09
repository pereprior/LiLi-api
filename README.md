# LiLi API

LiLi is a home assistant I’m building for my own home. I want to manage my tasks and reminders on a system I control, without storing that data with a third-party service. I host it myself and am designing it so that, over time, I can interact with it through the web, a mobile app, or voice.

This repository contains LiLi’s backend and API. The web interface will be developed as a separate project. This is a work in progress, not a finished product. Version 0.2 aims to support tasks and reminders. **Authentication and the tasks API are implemented**, with Google sign-in restricted to an email allowlist and local sessions stored in PostgreSQL. Tasks support one level of subtasks, manual states, Madrid local dates, and deletion based on their state. Reminder dates can be stored, but scheduling notifications and sending emails are still pending.

## How it’s designed

LiLi is a modular application built with TypeScript and NestJS. Each future interface should invoke the same core actions, so task rules do not depend on whether a request comes through HTTP, voice, or an automation. For now, the API’s implemented functionality centers on sign-in: Google verifies the user’s identity; LiLi decides whether the account is allowed and manages its own session.

The aim is to keep an architecture that can grow without turning a personal assistant into an unnecessary collection of services. The current code and design decisions matter more than hypothetical future capabilities.

## Getting started

You’ll need Node.js 24 or later, pnpm, Docker with Compose, and Google OAuth credentials. Register `http://localhost:3000/auth/google/callback` as a redirect URI in Google for local development.

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Create a `.env` file in the repository root. The application and Docker Compose use these variables:

   ```dotenv
   NODE_ENV=development
   APP_ORIGIN=http://localhost:3000
   AUTH_GOOGLE_CLIENT_ID=<client-id>
   AUTH_GOOGLE_CLIENT_SECRET=<client-secret>
   AUTH_GOOGLE_ALLOWED_EMAILS=your-email@example.com
   POSTGRES_DB=lili
   POSTGRES_USER=lili
   POSTGRES_PASSWORD=<local-password>
   POSTGRES_PORT=5432
   DATABASE_URL=postgresql://lili:<local-password>@localhost:5432/lili
   ```

   Use the email address of the Google account you’ll sign in with. If you change `APP_ORIGIN`, register the new callback URI in Google, keeping the `/auth/google/callback` path. Do not commit `.env` to the repository.

3. Start PostgreSQL with `pnpm db:up`. Apply migrations with `pnpm db:migrate:deploy` and generate the Prisma client with `pnpm exec prisma generate`.
4. Start the application with `pnpm dev` and open `http://localhost:3000/auth/google` to sign in.

## Exploring the API

In development, `http://localhost:3000/api` opens the OpenAPI documentation. Its JSON definition is also available at `http://localhost:3000/api-json`. The source lives in [`src/docs/openapi.yaml`](src/docs/openapi.yaml), with each path and schema in its own YAML file. The documentation is written to make it easy to return to the project later and understand what each operation does, how the Google sign-in flow fits together, and how cookies, responses, and errors work. The interactive documentation is not served in production. The YAML files are validated when the documentation is initialized in development.

Start with `GET /auth/google`. After returning from Google, `GET /auth/me` returns the current session’s user, and `POST /auth/logout` ends the session. Logout requires `Origin` or `Referer` to match `APP_ORIGIN`.

To run the local verification suite, use `pnpm run ci`. The test suite needs Docker to start its isolated database.
