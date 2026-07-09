// Node-only: prepare a local checkout of a PR head for codex to analyze.
// The user's GitHub token is injected via GIT_CONFIG_* env (http.extraHeader),
// so it is never written into a remote URL/config and never appears in argv
// (invisible to `ps`). All work for one repo dir is serialized (withRepoLock).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";

const MAX_CACHED_REPOS = 8;

// GitHub owner/repo identifier guard: alphanumerics + dot/underscore/hyphen, and
// never a path-traversal segment. Keeps repoDirFor() contained under reposRoot.
export function isSafeRepoComponent(value: string): boolean {
  return (
    /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && !value.includes("..")
  );
}

export function repoDirFor(
  reposRoot: string,
  owner: string,
  repo: string
): string {
  return join(reposRoot, owner, repo);
}

function assertContained(reposRoot: string, dir: string): void {
  const root = resolve(reposRoot);
  const target = resolve(dir);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("resolved repo path escapes the cache root");
  }
}

// Auth via environment rather than `-c ...` argv: the base64 token is not
// exposed in `ps`/proc cmdline. GIT_CONFIG_* is equivalent to `-c` but private.
function authEnv(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

interface RunGitOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

function runGit(args: string[], opts: RunGitOptions): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // stdout ignored (avoids a pipe-buffer deadlock on large `git diff` output);
    // stderr piped for progress.
    const child = spawn("git", args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const line = text.trim().split("\n").pop();
      if (line) opts.onProgress?.(line);
    });
    child.on("error", (err) => {
      reject(new Error(`git failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.trim() || `git exited with code ${code}`));
    });
  });
}

interface RepoEntry {
  path: string;
  mtimeMs: number;
}

// List cached repo dirs (reposRoot/<owner>/<repo>) with their mtimes.
function listRepoDirs(reposRoot: string): RepoEntry[] {
  if (!existsSync(reposRoot)) return [];
  const entries: RepoEntry[] = [];
  for (const owner of readdirSync(reposRoot)) {
    const ownerDir = join(reposRoot, owner);
    if (!statSync(ownerDir).isDirectory()) continue;
    for (const repo of readdirSync(ownerDir)) {
      const repoDir = join(ownerDir, repo);
      const s = statSync(repoDir);
      if (s.isDirectory()) entries.push({ path: repoDir, mtimeMs: s.mtimeMs });
    }
  }
  return entries;
}

/**
 * Pure LRU selection: keep the `max` most-recently-used repos (plus `keepPath`),
 * return the rest for eviction. Exported for testing.
 */
export function selectEvictions(
  entries: RepoEntry[],
  max: number,
  keepPath: string
): string[] {
  const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const evictions: string[] = [];
  let kept = 0;
  for (const entry of sorted) {
    if (entry.path === keepPath) continue;
    kept += 1;
    // Keep the first `max` most-recent repos; evict everything older.
    if (kept > max) evictions.push(entry.path);
  }
  return evictions;
}

// Dirs with an in-flight analysis (held by withRepoLock) — never evict these.
const activeDirs = new Set<string>();

function enforceLru(reposRoot: string, keepPath: string): void {
  for (const path of selectEvictions(
    listRepoDirs(reposRoot),
    MAX_CACHED_REPOS,
    keepPath
  )) {
    // Never delete a checkout that another analysis is actively reading.
    if (activeDirs.has(path)) continue;
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Best-effort eviction; a locked dir is not fatal to the analysis.
    }
  }
}

// Serialize all work for one repo dir (checkout + codex) so concurrent analyses
// of different PRs in the SAME repo don't stomp the shared working tree: the dir
// stays pinned to one request's head SHA for the whole checkout→codex critical
// section. Different repos still run concurrently.
const repoTails = new Map<string, Promise<unknown>>();

export function withRepoLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoTails.get(dir) ?? Promise.resolve();
  const run = prev
    .then(
      () => {},
      () => {}
    )
    .then(async () => {
      activeDirs.add(dir);
      try {
        return await fn();
      } finally {
        activeDirs.delete(dir);
      }
    });
  repoTails.set(dir, run);
  const settle = () => {
    if (repoTails.get(dir) === run) repoTails.delete(dir);
  };
  // `then(settle, settle)` runs cleanup on both paths AND consumes a rejected
  // `run` (settle returns void), so the ordinary failure/abort path can't leave
  // an unhandled rejection. The caller still awaits the original `run`.
  run.then(settle, settle);
  return run as Promise<T>;
}

export interface EnsureCheckoutInput {
  reposRoot: string;
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
  token: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Ensure a blobless checkout of `headSha` exists locally and return its path.
 * MUST be called inside withRepoLock(repoDirFor(...)) so the working tree isn't
 * re-pointed by a concurrent request. Base + head blobs are pre-materialized
 * under our authed env (via `git diff`) so codex's own `git diff base head` runs
 * offline — its sandbox blocks network and lacks our auth header.
 */
export async function ensureCheckout(
  input: EnsureCheckoutInput
): Promise<string> {
  if (!isSafeRepoComponent(input.owner) || !isSafeRepoComponent(input.repo)) {
    throw new Error("invalid owner/repo");
  }
  const dir = repoDirFor(input.reposRoot, input.owner, input.repo);
  assertContained(input.reposRoot, dir);

  const env = authEnv(input.token);
  const cleanUrl = `https://github.com/${input.owner}/${input.repo}.git`;
  const base = { env, onProgress: input.onProgress, signal: input.signal };

  mkdirSync(dirname(dir), { recursive: true });

  if (!existsSync(join(dir, ".git"))) {
    input.onProgress?.("Cloning repository…");
    await runGit(
      ["clone", "--filter=blob:none", "--no-checkout", cleanUrl, dir],
      { ...base, cwd: input.reposRoot }
    );
  }

  input.onProgress?.("Fetching commits…");
  await runGit(
    [
      "-C",
      dir,
      "fetch",
      "--filter=blob:none",
      "origin",
      input.baseSha,
      input.headSha,
    ],
    { ...base, cwd: dir }
  );

  input.onProgress?.("Checking out PR head…");
  await runGit(["-C", dir, "checkout", "--force", "--detach", input.headSha], {
    ...base,
    cwd: dir,
  });

  // Pre-materialize base+head blobs under our authed env so codex can diff offline.
  input.onProgress?.("Preparing diff…");
  await runGit(["-C", dir, "diff", input.baseSha, input.headSha], {
    ...base,
    cwd: dir,
  });

  enforceLru(input.reposRoot, dir);
  return dir;
}
