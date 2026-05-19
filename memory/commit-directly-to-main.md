---
name: commit-directly-to-main
description: User wants commits pushed directly to main, not feature branches/PRs
metadata:
  type: feedback
---

On this repo (beijing-travel) the user wants work committed and pushed directly to `main`. When asked twice, they explicitly said "主分支提交推送" and chose main over a feature-branch/PR flow.

**Why:** Solo personal project; git history is all direct commits to `main`. A feature-branch/PR workflow adds friction with no reviewer.

**How to apply:** When the user says commit/push here, commit on `main` and `git push origin main` directly. Don't auto-create feature branches or ask which branch. (If work was already on a temp branch, fast-forward `main` to it.) This overrides the default "branch first when on the default branch" behavior — for this repo only.
