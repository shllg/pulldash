---
description: Review the current diff (Claude + Codex arms, merged).
allowed-tools: [Read, Glob, Grep, Bash, Task, Skill]
---

# /pd-review

- Changed files (for routing; the arms read the diff themselves): !`git diff --name-only HEAD`

$ARGUMENTS

---

Run the `pulldash-review` skill on the current uncommitted diff — it is the single source of truth
for reviewing, so this command only delegates. It spawns the Claude arm (`pulldash-code-reviewer`)
and the Codex arm (`codex-agent`) as fresh, isolated subagents — each handed intent + `file:line`
pointers (never the diff) — and the main thread merges. Default `reviewers=both`; for a Codex-only
pass, say so. Do **not** read the full `git diff` inline here (route by filename; let the arms read
the tree). Present the skill's consolidated, severity-ranked verdict.
