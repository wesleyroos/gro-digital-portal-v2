# Autonomous feedback pipeline — one-time setup

This wires the existing feedback widget to a Claude Code GitHub Action that
builds and auto-merges approved changes.

## Flow

1. User submits feedback in the portal → existing `/api/feedback-chat` creates a task + emails you
2. Email now contains **✅ Build this** / **❌ Dismiss** buttons
3. Clicking **Build this** hits `/api/feedback/approve?token=...` on the portal
4. Portal verifies the signed token and fires `repository_dispatch` to GitHub
5. GitHub Action checks out `main`, runs Claude Code with the feedback as a prompt
6. Claude edits files (respecting `CLAUDE.md` protected paths)
7. Action runs `pnpm tsc --noEmit`, commits, and opens a PR
8. If typecheck passes AND no protected path was touched → auto-merge → Railway deploys
9. Otherwise → PR stays as draft for you to review manually

## 1. Run the migration

```bash
mysql "$DATABASE_URL" < drizzle/0047_feedback_approvals.sql
```

Or apply via your normal migration process.

## 2. Add env vars to Railway (portal)

```
FEEDBACK_APPROVAL_SECRET=<generate a random 32+ char string>
GITHUB_TOKEN_FOR_DISPATCH=<fine-grained PAT, see below>
GITHUB_REPO_OWNER=wesleyroos
GITHUB_REPO_NAME=gro-digital-portal-v2
PORTAL_URL=<public portal base url, e.g. https://portal.grodigital.co.za>
```

Generate the secret:

```bash
openssl rand -hex 32
```

Generate the PAT at https://github.com/settings/tokens?type=beta:

- Repository access: only `wesleyroos/gro-digital-portal-v2`
- Permissions: **Contents: read & write**, **Actions: read & write**, **Metadata: read**
- This token only needs `repository_dispatch` capability

## 3. Add secrets to the GitHub repo

Go to https://github.com/wesleyroos/gro-digital-portal-v2/settings/secrets/actions and add:

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Anthropic API key |
| `GH_PAT` | a PAT with `contents:write`, `pull-requests:write`, `actions:write` on this repo (can be the same one as above, but GitHub Actions cannot use the default `GITHUB_TOKEN` to auto-merge) |

## 4. Enable auto-merge on the repo

Settings → General → Pull Requests → tick **Allow auto-merge**.

Settings → Branches → `main` → require at least something trivial so auto-merge
can wait on it (optional; without any check, auto-merge fires instantly).

## 5. Test end-to-end

1. Submit a trivial piece of feedback through the widget (e.g. "Change the
   feedback success-screen subtitle to say 'Thanks! Team will review within
   24h.'")
2. Check your email — the Build/Dismiss buttons should appear
3. Click **Build this** — you should see a GitHub Action run start within ~10s
4. Watch the run on the Actions tab
5. If green and non-protected: PR opens and auto-merges; Railway redeploys
6. If the change touched a protected path: PR stays open as draft for your review

## Rollback

Every autonomous change lands as a single squashed PR. To revert:

```bash
gh pr list --state merged --label "" --search "feedback" --limit 5
gh pr revert <number>
```

## Killswitch

To disable the pipeline without removing code, unset `FEEDBACK_APPROVAL_SECRET`
on Railway. Existing links die, new emails fall back to a disabled-state
message, and nothing dispatches.

To pause GitHub side only: disable the workflow in the Actions tab.

## Known limits (v1)

- No callback from GitHub → portal, so the `feedbackApprovals` row stays at
  `approved` forever. Not a bug — the GitHub PR is the source of truth for
  outcome. Can add a `/api/feedback/complete` webhook later if you want the
  portal to track ship state.
- No test suite run before auto-merge (only typecheck). Add `pnpm test` to the
  workflow once test coverage is trustworthy.
- Tokens are 14-day single-use but not rotated if a mail client prefetches — if
  you see premature "Already approved" states from prefetching, switch the
  approval endpoint to `POST` with a confirm page.
