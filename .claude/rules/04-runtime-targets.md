# Runtime Targets — Browser / Hono / Electron (`src/electron/**`, `src/node/**`, `src/index.ts`)

> **Load when:** editing `src/electron/**`, `src/node/**`, `src/index.ts`, or the build scripts
> in `scripts/`.

## One bundle, three targets

The same browser bundle (`src/browser/**`, built by `scripts/build-browser.ts`) is served three ways:

| Target           | Entry                                                                     | Served by                                                            |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Browser SPA      | `src/browser/index.tsx`                                                   | pulldash.com (Vercel, `scripts/build-vercel.ts`)                     |
| Hono server      | `src/index.ts` (Vercel) · `src/node/main.ts` (local, `@hono/node-server`) | `bun dev:node` / Vercel                                              |
| Electron desktop | `src/electron/**`                                                         | `electron-builder` (`scripts/build-electron.ts`), `electron-updater` |

## Rules

- **Keep the shared bundle target-agnostic.** Target-specific code lives in `src/node/**`,
  `src/electron/**`, or `src/index.ts` — never fork `src/browser/**` per target.
- **Electron security boundary.** Main/preload is the trusted side; the renderer is the browser
  bundle. Expose only a minimal, explicit IPC surface via the preload bridge — **never** leak Node
  APIs, the filesystem, or secrets into the renderer. Treat anything from the renderer as untrusted.
- **Hono server** (`src/index.ts` / `src/node/main.ts`) is a thin static/host layer — pulldash is
  client-side (`03-github-api.md`); don't grow it into a GitHub proxy.
- **Build scripts are Bun scripts** (`scripts/build-*.ts`), not a webpack/Node toolchain. Changing
  build output? Verify `bun run build:browser` (and `bun run electron:build` when touching Electron).
- **Electron release is irreversible and operator-only** — `v*` tags fire the 3-OS release
  (`19-git-and-autonomy.md`). Never push a tag.

## MUST / NEVER

- **MUST** keep target-specific code out of `src/browser/**`.
- **MUST** verify the relevant build (`bun run build:browser` / `electron:build`) after touching
  bundling or a target entry.
- **NEVER** widen the Electron IPC surface beyond what's needed, or leak Node/secrets to the renderer.
- **NEVER** turn the Hono layer into a credential-holding backend.
