# LiLi Agent Guidelines

## Project Overview

LiLi is a private, self-hosted home assistant. Version 0.2 focuses on tasks and
reminders while establishing a core that can later support web, mobile, voice,
and home-automation interfaces.

The primary implementation language is TypeScript. The application uses
NestJS 12 on Node.js 24 or newer and is managed with pnpm.

## Intended Use and Development Priorities

- LiLi is intended for private use by its creator and, at most, a few family
  members. Treat this as the default context for all development decisions
  unless the user explicitly changes the project's scope.

- Base features, architecture, user experience, and operational decisions on
  concrete personal and household needs. Prioritize simplicity, reliability,
  and ease of maintenance by the creator.

- Do not justify additional complexity with hypothetical public users,
  commercial use, mass adoption, or large-scale growth. Features such as public
  registration, multi-tenancy, billing, or elaborate role systems require a
  concrete need within the agreed scope.

- Keep security, data integrity, and useful testing appropriate to the actual
  deployment and household use. Private use does not make personal data or
  reliable behavior less important.

## Collaboration and Communication

- Work as the user's technical teammate. Treat the project as a shared effort,
  while recognizing that the user makes the final decision.

- Offer honest opinions and challenge ideas when appropriate. Discuss
  disagreements objectively through evidence, assumptions, and trade-offs.

- Explain unfamiliar concepts clearly without paternalism, flattery, empty
  reassurance, or unnecessary softening.

- Distinguish facts, assumptions, preferences, and practical constraints.

- Surface contradictions, hidden costs, and broader implications when they
  materially affect the project.

- For substantive decisions, progress from context to analysis and then to a
  concrete recommendation.

- Keep responses proportional and concise. Avoid repetition, generic advice,
  and unnecessary formatting.

- Support important external or time-sensitive claims with primary sources and
  repository-specific claims with references to the relevant code.

## Documentation Audiences

- Write the README as the entry point for someone who knows nothing about LiLi.
  Explain what the project is, why it exists, what has actually been built, and
  how to explore it. Make it engaging through clarity and honest technical
  choices, not a sales pitch: LiLi is primarily for its creator's own use.

- Write the README in a natural, approachable voice. It should give an outside
  reader a good impression of the developer's thinking and work without sounding
  promotional or like a template.

- Treat OpenAPI as developer documentation for the project's future maintainers,
  including the creator and AI assistants. Describe what each operation does,
  its place in the relevant flow, authentication and input requirements, response
  and error behavior, and any non-obvious effects. Endpoint names and schemas
  alone are not enough to explain the API.

- Keep the OpenAPI source in separate YAML files under `src/docs/`, with
  references between them. Do not put OpenAPI decorators or descriptions in
  controllers, services, or response classes.

- Keep documentation accurate to the implemented behavior and write it for
  humans: specific, clear, and easy to understand without prior project context.

## Approval and Execution Boundaries

- When the user gives a concrete task, carry out the ordinary, in-scope steps
  needed to complete it without repeatedly asking for confirmation. This
  includes inspecting relevant files, editing the requested area, and running
  appropriate verification commands.

- Ask for approval before actions that materially expand the agreed scope,
  are destructive or difficult to reverse, publish or communicate externally,
  access external accounts or services, install or update dependencies, or
  otherwise have a meaningful effect beyond the local task.

- If the request is ambiguous enough that a reasonable implementation choice
  would materially change the result, explain the alternatives and ask before
  proceeding.

- Make reasonable low-impact assumptions when they keep work within the stated
  task.

- Do not make unrelated changes or take initiative outside the user's current
  request. Report any relevant issue you discover and let the user decide
  whether to address it.

## Sources of Truth

When repository state and documentation disagree, use this order of precedence:

1. The user's explicit instruction for the current task.
2. The current repository code and configuration.
3. `AGENTS.md`.
4. Installed project skills.
5. Official documentation for the exact installed version.
6. General framework conventions or prior knowledge.

Do not assume package APIs, configuration options, framework behavior, or
repository conventions when they can reasonably be verified from the repository
or official documentation.

## Architecture

- Keep the application as a feature-oriented modular monolith unless a
  demonstrated requirement justifies distributing it.

- Keep interfaces separate from the application core. Web, mobile, voice, CLI,
  LLM, and automation entry points must invoke the same application actions
  rather than implementing business logic themselves.

- For user-, agent-, or interface-initiated application operations where
  authorization, auditing, or multiple entry points matter, prefer an
  actor + action + payload + handler model.

- Do not force application-action abstractions onto internal helpers, pure
  functions, domain calculations, or other code that does not benefit from
  them.

- Prefer the simplest design that satisfies current requirements.

- Add interfaces, injection tokens, repository abstractions, or additional
  architectural layers only when they represent a real boundary, support
  multiple implementations, isolate infrastructure, or provide a concrete
  testing or maintainability benefit.

- Use events only for genuine cross-module decoupling or naturally asynchronous
  workflows. Do not use events merely to avoid a normal method call.

- Do not introduce microservices, CQRS, event sourcing, or speculative
  abstractions unless explicitly requested or justified by current needs.

- Treat installed architecture or framework skills as guidance rather than
  absolute specifications. Repository instructions, repository state, and
  installed package versions take precedence over skill examples.

## Change Discipline

- Prefer the smallest coherent change that fully solves the requested problem.

- Do not refactor surrounding code merely because a cleaner design is possible.

- Preserve existing public contracts unless changing them is part of the task.

- Follow established repository patterns unless there is a concrete reason not
  to.

- If an existing pattern appears problematic, mention it separately rather than
  silently replacing it as part of an unrelated change.

- Avoid speculative compatibility layers, abstractions, fallbacks, or
  configuration.

- Do not introduce code for hypothetical future requirements unless the current
  design would otherwise create a meaningful constraint.

- Remove obsolete code created by the requested change when doing so is clearly
  safe and part of the same scope.

## Current Project Structure

- `src/`: application source, including bootstrap, root composition, and
  feature-oriented modules such as tasks and reminders.

- `.github/workflows/`: continuous-integration workflows.

- `.agents/skills/`: project and technology guidance, not application source
  code.

- `dist/`: generated build output; never edit it manually.

Prefer feature ownership over generic technical folders when deciding where new
application code belongs.

## Code Style

- Follow `tsconfig.json`, ESLint, Prettier, and EditorConfig. Do not duplicate
  or bypass their rules.

- Use ESM and NodeNext-compatible imports, including `.js` extensions for local
  runtime imports where required by the project configuration.

- Write strict TypeScript.

- Use type-only imports where required.

- Do not leave floating, ignored, or misused promises.

- Declare explicit return types for exported functions and public methods.

- Prefer clear names, focused units, and constructor-based dependency injection.

- Avoid unnecessary comments that merely restate the code. Comment decisions,
  constraints, or non-obvious behavior when useful.

- Do not edit generated files or commit build output as source changes.

## Testing Philosophy

- Treat tests as regression safeguards for future changes and maintenance, not
  as coverage for its own sake.

- A test should alert us when a change breaks an established behavior.

- Prefer small, focused tests. Each test should verify one concrete behavior.

- Favor several specific tests over broad tests with unrelated assertions and
  responsibilities.

- Test only the behavior owned by the subject under test.

- Mock collaborators and verify their contract-level interaction when that
  interaction is part of the subject's behavior.

- Test each collaborator's own implementation in its dedicated test suite.

- Avoid testing framework internals or implementation details that are not part
  of the observable contract.

- Add broader or more complex tests when they provide meaningful confidence in
  a complete workflow.

Maintain two primary test levels:

- Unit tests verify services, handlers, domain logic, and utility classes in
  isolation.

- End-to-end tests verify complete externally observable application flows.

## Commands

- Install dependencies: `pnpm install --frozen-lockfile`
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint`
- Run tests once: `pnpm test`
- Run tests in watch mode: `pnpm test:watch`
- Build: `pnpm build`
- Check formatting: `pnpm format:check`
- Run the complete local verification suite: `pnpm run ci`

Use pnpm and the scripts defined in `package.json`. Do not substitute npm or yarn
commands.

## Database Migrations

- Create migrations from the Prisma schema using `pnpm db:migrate --name <name>`
  (`prisma migrate dev`). Do not create migration files manually, use
  `prisma migrate diff` to create them, or edit their generated SQL by hand.
- Use `pnpm db:migrate:deploy` to apply existing migrations outside development.
- Do not delete or regenerate applied migration history unless the user explicitly
  authorizes it. Check affected databases and data before any reset.

## Verification

After changing code:

- Run the narrowest relevant tests first.

- Run type-checking and linting when the modified code can affect them.

- Run formatting checks when files were created or materially reformatted.

- Run broader tests when the change crosses module boundaries or when narrow
  verification does not provide sufficient confidence.

- Use `pnpm run ci` for substantial changes, before considering a broad task
  complete, or when explicitly requested.

- Do not fix unrelated verification failures as part of the current task.

- If unrelated failures prevent verification, report them clearly and
  distinguish them from failures caused by the current change.

- Report which relevant verification commands were run and whether they passed.

## Skills

- Use project skills when their subject is materially relevant to the task.

- Treat `nestjs-best-practices` as guidance for NestJS-specific implementation
  and design decisions.

- Use `vitest` when creating, changing, debugging, or reviewing tests.

- Use `security-threat-model` for security-sensitive functionality or when a
  structured threat analysis is explicitly requested.

- Do not load or apply a skill merely because it is available.

- Repository-specific decisions override generic skill recommendations.
