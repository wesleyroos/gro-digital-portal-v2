# GRO Digital Portal — Agent Guide

This file is read by Claude Code when it runs autonomously on approved user
feedback. Everything here is binding.

## Stack

- React + Vite + TypeScript SPA in `client/`
- Express + tRPC API in `server/`
- MySQL via Drizzle ORM in `drizzle/` (schema + numbered SQL migrations)
- Deployed to Railway; pushing to `main` triggers a deploy
- Auth: session cookies + `sdk.authenticateRequest`; roles are `client`, `admin`, `superAdmin`

## Layout pointers

- `server/routers.ts` — tRPC router entry, imports most DB helpers from `server/db.ts`
- `server/_core/oauth.ts` — Express routes including `/api/feedback-chat`, feedback approval endpoints, OAuth flows
- `server/db.ts` — all Drizzle query helpers
- `drizzle/schema.ts` — single source of truth for tables
- `client/src/components/` — shared UI (widgets, layout)
- `client/src/pages/` — one file per route
- `shared/types.ts`, `shared/const.ts` — types/constants shared client↔server

## Protected paths — DO NOT EDIT autonomously

If a feedback item requires touching any of these, stop editing and write a
short plan to `.claude-feedback-plan.md` describing what would need to change
and why. The workflow will open a draft PR for human review instead of
auto-merging.

- `.github/**` — CI and the feedback workflow itself
- `server/_core/oauth.ts` — auth, session, OAuth flows
- `server/_core/env.ts` — environment variable surface
- `server/facebook*`, `server/instagram*`, `server/linkedin*`, `server/google-oauth.ts` — OAuth integrations
- `drizzle/*.sql`, `drizzle/schema.ts` — database schema and migrations
- `package.json`, `pnpm-lock.yaml` — dependency changes
- `railway.json` — deploy config
- `scripts/sync-db.js` — prod data sync

Safe areas for autonomous edits: `client/src/**`, non-OAuth handlers in
`server/*.ts` (not `_core`), `shared/types.ts` (additive changes only), and
documentation.

## Quality bar

- Match the existing style — don't add comments explaining what code does
- No new abstractions for "future flexibility"; solve what was asked
- No new dependencies without flagging in `.claude-feedback-plan.md` first
- Preserve exact indentation when editing; check neighbouring files for conventions
- If a feedback item is vague or ambiguous, don't guess — write a plan instead

## Output contract

When finished, always write:

- `.claude-feedback-summary.md` — 3–6 lines: what changed, files touched, why
- `.claude-feedback-plan.md` — ONLY if you did not implement (ambiguous, protected, or risky); explains what a human needs to decide

## Build/test commands (CI runs these — you don't need to)

- Build (real ship gate, matches Railway): `pnpm build`
- Tests: `pnpm test` (vitest)
- Note: `pnpm tsc --noEmit` is intentionally not the gate — the repo has known
  pre-existing tRPC naming conflicts that we haven't untangled yet.
