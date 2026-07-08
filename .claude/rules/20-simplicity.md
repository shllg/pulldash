# Simplicity — Prefer the Smaller Shape

> **Purpose:** Features keep getting built bigger than the problem requires — a new
> abstraction where reuse would do, a god component where decomposition would do, a bespoke
> re-implementation of a pattern that already exists. This rule makes "is this simpler than
> it needs to be?" an **enforced review lens** that every reviewer applies (the Claude
> reviewer, `pulldash-code-reviewer`, the `pulldash-work` loop, and the Codex arm) so the same
> question gets asked no matter who reviews. On pulldash, **simplicity and performance are
> the same lens**: less code on the render/main-thread path is usually both simpler and faster.

## Scope

Applies to all hand-written code under `src/**` and `scripts/**`. Qualitative lens, not a
metric gate — no line-count threshold. Does not apply to generated output, lockfiles, or docs.

## The test

> **"Would a senior engineer say this is overcomplicated?"** — and, pulldash-specific,
> **"Does this add work to the render or main thread that the problem didn't require?"**

If yes, simplify before shipping.

## The lens — what to flag

1. **Larger than the problem requires.** More code, indirection, or configurability than the
   task asked for. Speculative flexibility nobody requested is debt. Cut to the minimum.
2. **God components / functions.** Doing too many things where decomposition reads and tests
   better. Prefer extraction. Keep components thin — state and logic belong in the external
   store / hooks (the data layer), not sprawled through JSX.
3. **Duplicated or near-duplicated logic.** Unify — but only genuine duplication (rule of
   three), not incidental similarity that will diverge.
4. **Bespoke re-implementation of an existing pattern.** New code re-inventing a helper,
   store slice, or convention the codebase already has. Reuse it. Read neighbouring code first.
5. **Avoidable render/main-thread cost.** New object/array/function literals in props each
   render (new refs → re-render), work that belongs in a `useMemo` / the worker pool / the
   store, effects that could be derived state. Name it — perf is P1.

## Reuse over new abstraction — but earn it

- Default to reuse/unification over a new abstraction; the existing pattern is cheaper.
- Don't over-correct into premature abstraction — a single-use abstraction is itself
  complexity. Rule of three before extracting.
- **Surgical changes still win.** This rule never licenses refactoring adjacent, unrelated
  code. Flag the broader simplification; scope the edit to the request.

## MUST

- **MUST** apply the test as a review lens on every change — author and reviewer alike — and
  choose the smaller shape at equal correctness.
- **MUST** reuse an existing pattern/helper/store slice over a bespoke re-implementation
  unless there's a stated reason it doesn't fit.
- **MUST** surface an available materially-simpler (or materially-faster) design explicitly
  rather than silently shipping the larger one.

## NEVER

- **NEVER** add speculative flexibility, configurability, or abstraction the task didn't ask for.
- **NEVER** use this rule as cover to refactor unrelated code — flag it, don't sprawl the diff.
- **NEVER** force a unification onto incidental similarity likely to diverge.
