---
name: pulldash-review
description: Review the uncommitted working diff with two independent arms — a Claude arm (pulldash-code-reviewer) and a Codex arm (codex-agent) — each handed intent + file:line pointers (never the pasted diff), then merge and dedupe their findings. The single source of truth for reviewing a pulldash change. Use when the user says "review this", "/pd-review", or from the pulldash-work loop's review step.
---

# pulldash-review

Dual-arm review of the **uncommitted** changes. Read-only — never edits or commits. Perf
regressions (unnecessary re-renders, main-thread work) rank as correctness, not nits.

## Steps

1. **Frame the intent.** From the invoking prompt + conversation, state in 1–3 lines what the
   change is supposed to do and what's out of scope. Note the changed dirs (`git status --short`)
   to route by rule — do **not** read the full `git diff` inline (that pulls the whole diff into
   the main transcript and re-reads it every later turn; let the arms read the tree).

2. **Spawn both arms in parallel** (one message, two `Task` calls) — hand each the intent +
   `file:line` pointers, **never a pasted diff** (each reads the working tree itself):
   - `pulldash-code-reviewer` — the Claude arm (correctness → performance → simplicity, routed by
     directory to `.claude/rules/01–05` + `20`).
   - `codex-agent` (Review mode) — the Codex arm, fresh read-only session, cross-vendor second opinion.

   Defaults: both arms. For a Codex-only pass (the final fresh-Codex gate / "ask codex"), spawn
   only `codex-agent`.

3. **Merge + dedupe** into one severity-ranked list with `[Claude]` / `[Codex]` / `[both]`
   attribution: `severity — file:line — problem — fix`. A missing or errored arm is **never**
   "clean" — report it and re-run that arm.

4. **Present** the consolidated output + a one-line verdict (CLEAN / FINDINGS). Do **not** fix
   issues unless the invoking prompt asks — surface them; the human or the `pulldash-work` loop decides.

## Never

- Never paste the diff to an arm (a reviewer primed with the author's narrative misses invariant
  breaks). Never edit/commit here. Never suggest browser-tool testing — cover via `bun test`.
