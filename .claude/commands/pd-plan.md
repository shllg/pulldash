---
description: Plan a pulldash change, then route it to a GitHub issue (or into pd-work).
---

# /pd-plan

Invoke the `pulldash-plan` skill to plan a pulldash feature or change. It asks up front whether
this is a quick change or a substantial feature, explores the relevant data layer / store / API /
runtime, designs against the pulldash invariants (perf P1, external-store data layer, client-side
GitHub API, three runtime targets), lays out ordered slices + a data-layer testing plan, flags
risks, then routes to a specified `ready-for-agent` GitHub issue (or hands straight to
`pulldash-work`). Read-only — it never writes code or opens a PR.

Feature / input:

$ARGUMENTS
