# marketo-bulk-actions

## Project

- Repo: `dirixtom/marketo-bulk-actions`. Empty as of 2026-10-22: no source, no commits, no stack chosen yet.
- Purpose, from the name: run bulk actions against a Marketo instance.
- Marketo API credentials (client ID, client secret, instance endpoints) go in `.env` / `.env.local` only. Commit placeholders in `.env.example`.
- Update this section once the stack is scaffolded: package manager, build/test/lint commands, folder layout.

## Agent skills

### Issue tracker

GitHub Issues on `dirixtom/marketo-bulk-actions`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# Global Development Standards

## Package Manager

Use `pnpm` (monorepos, standard projects) or `bun` (speed-critical or already in use). Never `yarn`. Migrate yarn projects to pnpm.

## Framework Selection
- **Hard constraints:** Never Next.js. Never Vercel. Deploy to Cloudflare, Railway, Fly.io, AWS, or generic Node hosts only.
  - Silently evaluate features before scaffolding, then state the choice with a one-line rationale.

- **TanStack Start**:  interactive/write-heavy apps (dashboards, internal tools, multi-step forms, SPAs).
  - Default stack: TanStack Router (file-based, type-safe) · TanStack Query via loaders + server functions · Vite · Nitro · Zod · Zustand for client state.
- **Astro**:  content-first sites (marketing, blogs, docs, portfolios). Zero JS by default, React/Vue islands for interactivity. Deploy static to Cloudflare Pages or SSR with Node adapter.
- **TanStack Start + prerendering**:  hybrid apps with content and interactive pages in one codebase. Content routes use SSR + cache headers or Nitro prerendering; interactive routes use loaders + Query.
- **React Email**:  emails and email templates.

- When using Tailwind, always verify and install the latest version. Fetch the framework guide before scaffolding: [TanStack Start](https://tailwindcss.com/docs/installation/framework-guides/tanstack-start) · [Astro](https://tailwindcss.com/docs/installation/framework-guides/astro).

Terraform needs to be OpenTofu when possible.

## Tests
- **Runner:** Vitest for unit/integration, Playwright for E2E. Never Jest.
  - Co-locate unit tests as `*.test.ts(x)`; E2E specs in `e2e/`. Run the suite before any PR; never commit failing tests.

Test what can break: server functions, loaders, validators, state transitions, utilities. Skip framework internals and trivial render output.

- **TanStack Start**: Vitest for server functions, loaders, Zod schemas, Zustand stores (test the store, not the component). Playwright for write paths (auth, multi-step forms, mutations).
- **Astro**:  Vitest + Container API for components; test island logic and Zod content-collection schemas, not the content. Playwright for key pages and island interactivity.
- **TanStack Start + prerendering**:  both of the above; also assert prerendered routes return static HTML with no client runtime.
- **React Email**: Vitest snapshots for markup; assert dynamic props (links, names, conditionals) render correctly.

## Containers
- Runtime is **OrbStack**, not Docker Desktop. The `docker` / `docker compose` CLI is unchanged:  use it normally.
- Never suggest installing or starting Docker Desktop, Colima, or `docker-machine`. If the daemon is unreachable, the fix is `orb start`.
- Docker context: `orbstack`. Kubernetes: `orb start k8s`. VMs: `orb` / `orbctl`.

## Environment Variables & Secrets
- Never read, reveal or output the contents of .env/.env.local/terraform.tfvars by any means. Work only with `.env.example` and 
- Never commit real secrets. Keep `.env*` and `*.tfvars` in `.gitignore` on every level.
- Maintain `.env.example` with placeholder secrets or project related values.
- Accommodate for both `.env` and `.env.local` use and provide a solution to, without exposing and non-destructively, copy and move variables from one file to another.
  - For example: `.env.example` to `.env` and `.env.local` when the live variables are out of date. Delete from `.env` and `.env.local` when the live variables became obsolete. `.env.local` to `.env` when `.env`'s variable needs updating. `.env` and `.env.local` to `*.tfvars` when it needs updating. Generate a new key in scaleway, whatever hyperscaler, server solution and git solution is used and deploy it in `.env`, `.env.local` and `*.tfvars` if required. Deploy variables in the hyperscaler. 


## Git Workflow
- Never commit directly to `main`/`master`. Always branch first, pull latest `main` beforehand.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`, `tree/` + short description, always name a branch after the feature being implemented.
- Never force-push to `main`. Never `--no-verify` without explicit instruction.

## Pull requests
- Link every pull request number to the actual pull request with Markdown, including numbers in tables and replacement lists
- Before writing a pull request link, verify its URL with `gh pr view <number> --json url --jq .url` in the target checkout or use equivalent GitHub metadata. Never construct a PR URL from a user name or guessed owner.
- Titles must follow conventions of the repo. They should be simple and easy to understand. Conventional commit styles in projects that use them, i.e. "chore(web): clean up obsolete variables"
- PR descriptions should aim for simplicity. Open with a minimal, clear description of the problem. Follow-up with how you solved it.
- **Open a real PR, not a draft.** Drafts do not get review-bot coverage.
- **Rebase onto latest `main` branch before opening.** Stale branches conflict and waste review time.
- When asked to monitor, wait for or babysit a PR: Poll checks, comments and statuses newer than the last push; verify each finding against the source before acting on it; fix real ones and dismiss false-positives with a written reason; fix CI failures, distinguish real breaks from known flaky infra. If nothing is new, stay quiet and do not post filler comments. Stop when the review bots are green on the latest commit.
- Merge per disposition given (merge when green, or stop and report). If none given: merge when green, report and auto-fix when red.

## Routines and scheduled tasks
- When creating a routine or scheduled task, always set its permission mode to bypass permissions so unattended runs never stall on an approval prompt.

## Subagents
Never use Haiku or Sonnet for subagents. You should use the currently selected model. If you have a good reason to use a different model, ask for approval.

## Approvals

In general I approve of the actions, commands and tools required to complete the task I requested.

For example, if I ask you to show me an HTML write-up, I expect you to publish that HTML if necessary. If I ask you to create a UI PR with screenshots, you're expected to upload the screenshots and include them in the description. These are examples, not an exhaustive list. Use your judgement to apply the same principle to other situations.

Approve the commands and tools needed to complete the task. Only ask me when there is a real concern about exposing sensitive information or an action that goes far beyond what was requested or in the implementation spec in an irreversible way.

When a step doesn't need my input, keep going. Put status notes in the same message as your next action. Stop and ask only when you cannot continue without me, or before anything destructive: deleting data or making changes outside the repository you're currently working in.

## Writing

All output: chat, commits, PR bodies, code comments, docs.

### Structure

- Answer what was asked, stop. Follow-ups get one line, never delivered unasked. No recap.
- Each fact once. Rephrasing is not a second point.
- No narration of what you are about to check or rate. Findings only.
- Cite file.ts:223 instead of paraphrasing it. Quote only when the wording is the point.
- No verdicts. State the finding, don't rate it or say what it reveals.
- No trailing emphasis: "and it's real", "that's not nothing", "which is the tell", "and that matters", "worse than you think", "you'd assume X, but". Test: delete the sentence, if no fact is lost it was one.
- Headings only at 3+ sections. Sentence case, no emoji.

### Style

- No preamble or sign-off: "Great question", "You're absolutely right", "Let me", "Hope this helps", "Let me know if".
- No em-dashes. Period or comma, not parentheses. Colons only before a list. Straight quotes.
- use/help/many/to/because, not utilize/leverage/facilitate/numerous/in order to/due to the fact that.
- Banned: additionally, crucial, delve, enhance, fostering, intricate, landscape, pivotal, showcase, testament, underscore, seamless, robust.
- No "not just X, but Y". No bold labels that restate the line.

Prose shipping outside the repo (posts, client email, README): run unslop on top.

