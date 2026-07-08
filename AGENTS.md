# pulldash

Pulldash is the fastest way to review pull requests.

## Non-Negotiables

1. **Deploy-branch floor.** Every push to `main` auto-deploys the web app to pulldash.com
   (Vercel); every `v*` tag push fires an irreversible 3-OS Electron release (`release.yml`).
   **NEVER** commit, push, or merge `main`, and **NEVER** push a `v*` tag. Agents work on a
   feature branch, open a PR, and STOP — the operator merges. This is enforced mechanically
   by `.claude/hooks/git-push-branch-guard.sh` + `.claude/settings.json` (which also denies
   the mutating `mcp__github__*` write tools). Detail: `.claude/rules/19-git-and-autonomy.md`.
2. **NEVER use browser tools** against this project — they do not work here. Verify UI at the
   data layer via `bun test` (the frontend renders the data dumbly).
3. **Performance is P1** — jank, lag, unnecessary re-renders, and main-thread work are
   correctness defects, not nits.
4. **Bun for everything**; `tsgo --noEmit` (not tsc) for typecheck; run `bun run typecheck`
   and `bun fmt` after changes.
5. **No AI attribution** — no `🤖` prefix, no `Co-Authored-By:` trailer on commits/PRs.

## Development

Use `bun` for everything - package management, tests.

_NEVER_ use browser tools - they will not work with this project.

## Principles

- Performance is P1. If things feel laggy or are not smooth, it is of the utmost importance to fix. Pulldash exists because GitHub's PR review is slow.
- Tests should primarily occur at the data-layer, and the frontend should mostly dummily render the data.

## Testing

Tests should be minimal, not conflict with each other, and not be race-prone.

If you make changes to a file that has tests, you should ensure the tests pass and add a test-case if one does not already exist covering it.
We do not want duplicative tiny tests, but we want cases to be covered.

Good:

- `import { test } from "bun:test"`
- File being tested: "file-name.tsx" -> test name: "file-name.test.tsx"

Bad:

- `import { it } from "bun:test"`
- Any form of timing-based test (e.g. `setTimeout`, `setImmediate`, etc)
- Deep nesting of tests
- File being tested: "my-component.tsx" -> test name: "debug.test.tsx"

## Linting

Always run `bun typecheck` and `bun fmt` after changes to ensure that files are formatted and have no type errors.

## Debugging

If the user provides a PR identifier, you should use the `gh` CLI to inspect the API so we can fix our implementation if it appears incorrect.

## PR + Release Workflow

- Reuse existing PRs; never close or recreate without instruction. Force-push updates.
- After every push run:

```bash
gh pr view <number> --json mergeable,mergeStateStatus | jq '.'
./scripts/wait_pr_checks.sh <pr_number>
```

- Generally run `wait_pr_checks` after submitting a PR to ensure CI passes.
- Status decoding: `mergeable=MERGEABLE` clean; `CONFLICTING` needs resolution. `mergeStateStatus=CLEAN` ready, `BLOCKED` waiting for CI, `BEHIND` rebase, `DIRTY` conflicts.
- If behind: `git fetch origin && git rebase origin/main && git push --force-with-lease`.
- Never enable auto-merge or merge at all unless the user explicitly says "merge it".
- PR descriptions: include only information a busy reviewer cannot infer; focus on implementation nuances or validation steps.
- Title prefixes: `perf|refactor|fix|feat|ci|bench`, e.g., `fix: handle workspace rename edge cases`.
- No `🤖` prefix and no `Co-Authored-By:` / AI-attribution trailer on commits or PRs (this fork's convention; see `.claude/rules/19-git-and-autonomy.md`).

## Agent rule loader

Depth lives once in `.claude/rules/NN-*.md` — load the matching rule when work touches its
surface (these are not auto-loaded):

| Surface                                                            | Rule                                     |
| ------------------------------------------------------------------ | ---------------------------------------- |
| always-on (stack, commands, non-negotiables)                       | `.claude/rules/00-core.md`               |
| `src/browser/**` — React 19 + external store, render/perf          | `.claude/rules/01-frontend-and-store.md` |
| `src/browser/contexts/**` — the data layer (where tests live)      | `.claude/rules/02-data-layer.md`         |
| `src/api/**` — GitHub/Octokit, client-side, CORS                   | `.claude/rules/03-github-api.md`         |
| `src/electron/**`, `src/node/**`, `src/index.ts` — runtime targets | `.claude/rules/04-runtime-targets.md`    |
| `**/*.test.ts(x)` — testing conventions                            | `.claude/rules/05-testing.md`            |
| commit / push / PR / merge / autonomy                              | `.claude/rules/19-git-and-autonomy.md`   |
| reviewing any change                                               | `.claude/rules/20-simplicity.md`         |

Slash commands (`/pd-*`, `.claude/commands/`: `pd-plan`, `pd-work`, `pd-review`, `pd-pr`,
`pd-checks`, `pd-pr-finalize`, `pd-rebase`, `pd-next`, `pd-merge`) are the HITL steering wheel and
are thin delegators; the loop logic lives in the `pulldash-*` skills (`pulldash-work`,
`pulldash-plan`, `pulldash-review`, `pulldash-rebase`, `pulldash-pr-finalize`, `pulldash-next`),
single-sourced in `.agents/skills/` and symlinked into `.claude/skills/` and `.codex/skills/`. See
`.claude/README.md` for the full map.
