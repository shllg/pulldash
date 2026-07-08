---
description: Pick the next agent-ready GitHub issue and route it into the pd-work loop.
---

# /pd-next

Invoke the `pulldash-next` skill: list open `ready-for-agent` issues on `shllg/pulldash`, skip
`needs-info` / `ready-for-human` / `wontfix`, rank them, confirm the pick, then hand the chosen
`#N` to `pulldash-work` (`/pd-work`) — branch-guarded supervised loop → PR → stop. Read-only until
the confirm; never merges. Adjust the label vocabulary in the skill if the repo uses a different taxonomy.

$ARGUMENTS
