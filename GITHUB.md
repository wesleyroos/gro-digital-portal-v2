# GitHub Guide

## Repo
https://github.com/wesleyroos/gro-digital-portal-v2

## Saving changes to GitHub

Run these commands in Terminal whenever you want to push updates:

```bash
cd /Users/wesleyroos/Downloads/gro-digital-portal
git add .
git commit -m "describe what you changed"
git push
```

## Checking what's changed before committing

```bash
git status        # see which files have changed
git diff          # see the actual changes line by line
```

## If you need to set up on a new machine

1. Go to https://github.com/wesleyroos/gro-digital-portal-v2 and copy the repo URL
2. Run: `git clone https://github.com/wesleyroos/gro-digital-portal-v2.git`
3. cd into the folder and run `pnpm install`

## Authentication
GitHub requires a Personal Access Token (not your password) when pushing.
Generate one at: https://github.com/settings/tokens/new
- Tick the **repo** scope
- Use the token as your "password" in the terminal prompt
