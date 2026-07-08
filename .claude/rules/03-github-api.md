# GitHub API — client-side Octokit (`src/api/**`)

> **Load when:** editing `src/api/**` (`api.ts`, `client.ts`, `diff.ts`, `types.ts`) or any
> code that talks to GitHub.

## Shape

pulldash calls the **GitHub API directly from the browser** — Octokit (`@octokit/core`),
client-side, subject to **CORS**, with **no backend proxy**. `src/api/client.ts` builds the
authenticated client; `api.ts` holds the request functions; `diff.ts` fetches/parses diffs;
`types.ts` holds the response shapes.

## Rules

- **No backend proxy, ever.** Everything runs against GitHub from the client. Don't add a
  server round-trip to "fix" CORS or hide a token — the token is the user's, held client-side.
- **Respect CORS + rate limits.** Only hit endpoints reachable from the browser. Handle
  rate-limit / abuse responses gracefully (surface, back off) — never hard-loop the API.
- **Type the responses.** Extend `types.ts` rather than sprinkling `any`; `tsgo` must stay clean.
- **Keep fetching in the data layer.** `src/api/**` is called by the `use*Loader` hooks
  (`02-data-layer.md`), not directly from components.
- **Debug against the real API with `gh`.** Per AGENTS.md, when given a PR identifier, use the
  `gh` CLI to inspect the real GitHub API and fix our implementation if it looks wrong —
  **NEVER** scrape with browser tools.
- **Auth** flows through `src/browser/contexts/auth.tsx` (PAT + OAuth); never log or persist a
  token anywhere it could leak (see `04-runtime-targets.md` for the Electron boundary).

## MUST / NEVER

- **MUST** keep GitHub access client-side and typed; route it through the data-layer loaders.
- **MUST** use `gh api` to verify behavior when a PR id is provided.
- **NEVER** add a backend proxy or server-held credential.
- **NEVER** ignore rate-limit/error responses or busy-loop the API.
