# LiLi API

LiLi is a home assistant I’m building for my own home. I want to manage my tasks and reminders on a system I control, without storing that data with a third-party service. I host it myself and am designing it so that, over time, I can interact with it through the web, a mobile app, or voice.

This repository contains LiLi’s backend and API. The web interface lives in the separate `LiLi-web` project and is still a scaffold. Version 0.5 implements Google sign-in restricted to an email allowlist, local sessions in PostgreSQL, tasks, and email reminders. Tasks support one level of subtasks, manual states, priorities, Madrid local dates, and deletion based on their state. The API provides search, filters, sorting, and views for overdue, today’s, and upcoming tasks. Completed and cancelled tasks cannot be edited or reopened.

When enabled, an internal worker sends reminders to the task owner’s Google email through a dedicated Gmail account. It stores delivery status and errors, retries temporary failures, and recovers reminders delayed by up to 24 hours. A reminder without an explicit time is scheduled for 06:00 in Madrid. A restart after Gmail accepts a message but before LiLi saves the result can cause a duplicate; SMTP acceptance does not confirm inbox delivery. Delivery status is currently internal and is not exposed by the task API.

## How it’s designed

LiLi is a modular application built with TypeScript and NestJS. Task controllers invoke `LiliService.execute({ actor, action, payload })`, which validates the input and dispatches it to the operation’s handler. Future interfaces can use the same actions without copying task rules. Google verifies the user’s identity; LiLi decides whether the account is allowed and manages its own session. A persistent, queryable action audit trail is not implemented yet.

The aim is to keep an architecture that can grow without turning a personal assistant into an unnecessary collection of services. The current code and design decisions matter more than hypothetical future capabilities.

## Getting started

You’ll need Node.js 24 or later, pnpm, Docker with Compose, and Google OAuth credentials. For local integration with LiLi Web, register `http://localhost:5173/auth/google/callback` as a redirect URI in Google.

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Create a `.env` file in the repository root. The application and Docker Compose use these variables:

   ```dotenv
   NODE_ENV=development
   APP_ORIGIN=http://localhost:5173
   AUTH_GOOGLE_CLIENT_ID=<client-id>
   AUTH_GOOGLE_CLIENT_SECRET=<client-secret>
   AUTH_GOOGLE_ALLOWED_EMAILS=your-email@example.com
   REMINDERS_ENABLED=false
   REMINDERS_GMAIL_USER=lili.reminder.noreply@gmail.com
   REMINDERS_GMAIL_APP_PASSWORD=<gmail-app-password>
   POSTGRES_DB=lili
   POSTGRES_USER=lili
   POSTGRES_PASSWORD=<local-password>
   POSTGRES_PORT=5432
   DATABASE_URL=postgresql://lili:<local-password>@localhost:5432/lili
   ```

   Use the email address of the Google account you’ll sign in with. If you change `APP_ORIGIN`, register the new callback URI in Google, keeping the `/auth/google/callback` path. Do not commit `.env` to the repository.

   The Gmail sender and app password are required, including when reminders are disabled. Neither has a default value. Set `REMINDERS_ENABLED=true` to enable sending from the dedicated Gmail account.

3. Start PostgreSQL with `pnpm db:up`. Apply migrations with `pnpm db:migrate:deploy` and generate the Prisma client with `pnpm exec prisma generate`.
4. Start the API with `pnpm dev`; it listens on port 3000 by default. In the sibling `LiLi-web` directory, run `pnpm dev` to start the frontend on port 5173. Open `http://localhost:5173/auth/google` to sign in. Vite proxies `/auth` and `/tasks` to the API, preserving the browser’s Origin header. After sign-in, the API redirects to `/` on the frontend origin; the frontend can call `/auth/me` to retrieve the session’s user.

`APP_ORIGIN` is the public browser origin, not the API’s internal address. Protected writes must come from that origin. In production, serve the built frontend and proxy `/auth` and `/tasks` to the API under one HTTPS origin; Vite’s development proxy is not a production server.

## Exploring the API

In development, `http://localhost:3000/api` opens the OpenAPI documentation. Its JSON definition is also available at `http://localhost:3000/api-json`. The source lives in [`src/docs/openapi.yaml`](src/docs/openapi.yaml), with each path and schema in its own YAML file. The documentation is written to make it easy to return to the project later and understand what each operation does, how the Google sign-in flow fits together, and how cookies, responses, and errors work. The interactive documentation is not served in production. The YAML files are validated when the documentation is initialized in development.

Start with `GET /auth/google`. After returning from Google, `GET /auth/me` returns the current session’s user, and `POST /auth/logout` ends the session. Logout requires `Origin` or `Referer` to match `APP_ORIGIN`.

To run the local verification suite, use `pnpm run ci`. The test suite needs Docker to start its isolated database.
