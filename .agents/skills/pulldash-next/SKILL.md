---
name: pulldash-next
description: Pick the next actionable GitHub issue for pulldash and route it into the build loop. Reads the issue tracker, filters to agent-ready work, ranks it, confirms the pick, then hands off to pulldash-work. Use when the user says "what's next", "/pd-next", "pick up the next issue", or "work the queue".
---

# Pick the next issue → work it

Find the next actionable issue on `shllg/pulldash` and route it to `pulldash-work` (`/pd-work`). Read-only until
the single confirm; never merges, never touches `main`.

## Label vocabulary (Matt Pocock default — adjust to the repo's actual labels)

| Label             | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `ready-for-agent` | Specified + agent-actionable — the queue `pulldash-next` pulls from. |
| `needs-triage`    | Unsorted; not yet actionable.                                        |
| `needs-info`      | Blocked on a question — skip.                                        |
| `ready-for-human` | Needs a human, not an agent — skip.                                  |
| `wontfix`         | Closed intent — skip.                                                |

## Steps

1. **Derive the repo** (`gh repo view` — pulldash is a fork) and list the queue:

   ```bash
   gh issue list --state open --label ready-for-agent \
     --json number,title,labels,url,updatedAt,comments
   ```

   Exclude anything also carrying `needs-info` / `ready-for-human` / `blocked`. If the queue is
   empty, say so and stop (offer to `gh issue list --label needs-triage` for triage instead).

2. **Rank** the candidates: explicit priority label if present (`p0`/`p1`/… or `priority:*`),
   else oldest-`updatedAt` first (FIFO), with a nudge toward small/specified issues. Present the
   top 3 as `#N — title — url` with a one-line why-this-first.

3. **Confirm (AskUserQuestion):** the top pick _(Recommended)_ / another listed issue / cancel.
   A thin one-liner issue with no acceptance criteria → say it needs specifying first, don't pick it.

4. **Hand off:** invoke `pulldash-work` (`/pd-work`) with the chosen `#N` (branch-guarded,
   supervised loop → PR → stop). `pulldash-next` does not implement — it selects and routes.

## Never

- Never pick an issue labeled `needs-info` / `ready-for-human` / `wontfix`, or an unspecified stub.
- Never merge, push `main`, or start work on the deploy branch (`pulldash-work` guards this).
