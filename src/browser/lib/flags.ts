/**
 * Experimental opt-in flags, read once from the URL query string at load.
 *
 * These gate in-progress work so it can ship dark on `main` without touching
 * the default render path. Query params (not the hash) are used so they survive
 * the app's hash-based file routing.
 */
function readFlag(name: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === value;
  } catch {
    return false;
  }
}

/**
 * `?engine=pierre` renders the diff pane with the experimental `@pierre/diffs`
 * engine instead of the built-in renderer. Off by default.
 */
export const USE_PIERRE_DIFF_ENGINE = readFlag("engine", "pierre");
