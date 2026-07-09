// Pure, tolerant parser for codex's analysis output → PRAnalysis.
// Type-only imports (erased at build) keep this Node/Electron-free and testable.
import type {
  PRAnalysis,
  AnalysisGroup,
  AnalysisLevel,
  FileAnalysisMeta,
} from "@/browser/contexts/pr-review";

// Minimal shape the parser needs from a changed file (satisfied by both the
// renderer's request payload and Octokit's PullRequestFile).
export interface AnalyzableFile {
  filename: string;
  additions?: number | null;
  deletions?: number | null;
}

const LEVELS: readonly AnalysisLevel[] = ["low", "medium", "high"];

function coerceLevel(value: unknown): AnalysisLevel {
  return typeof value === "string" &&
    (LEVELS as readonly string[]).includes(value)
    ? (value as AnalysisLevel)
    : "medium";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Pull the JSON object out of a possibly-noisy codex message: unwrap ```json
 * fences and/or surrounding prose by taking the first `{`..last `}` slice.
 * Returns null when no plausible object is present.
 */
export function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}

interface RawGroup {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  impact?: unknown;
  details?: unknown;
  filenames?: unknown;
}

/**
 * Parse codex output into a validated PRAnalysis. Hardened against the model:
 * unknown filenames are dropped, risk/complexity clamped to the allowed levels,
 * each file claimed by at most one group (first wins), and per-group +/- counts
 * are rolled up from the real PullRequestFile data (never from the model).
 * Throws on structurally-unusable output so the caller can fail closed.
 */
export function parseCodexAnalysis(
  raw: string,
  files: AnalyzableFile[]
): PRAnalysis {
  const json = extractJsonObject(raw);
  if (!json) throw new Error("codex output contained no JSON object");

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("codex output was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("codex output was not a JSON object");
  }

  const root = parsed as { groups?: unknown; fileMeta?: unknown };
  if (!Array.isArray(root.groups)) {
    throw new Error("codex output missing 'groups' array");
  }

  const known = new Map(files.map((f) => [f.filename, f]));
  const claimed = new Set<string>();
  const groups: AnalysisGroup[] = [];

  root.groups.forEach((rawGroup: RawGroup, index: number) => {
    if (typeof rawGroup !== "object" || rawGroup === null) return;

    const rawNames = Array.isArray(rawGroup.filenames)
      ? rawGroup.filenames
      : [];
    const filenames: string[] = [];
    let additions = 0;
    let deletions = 0;
    for (const name of rawNames) {
      if (typeof name !== "string") continue;
      const file = known.get(name);
      if (!file || claimed.has(name)) continue;
      claimed.add(name);
      filenames.push(name);
      additions += file.additions ?? 0;
      deletions += file.deletions ?? 0;
    }
    // Drop groups that reference no real, unclaimed files.
    if (filenames.length === 0) return;

    const id = asString(rawGroup.id) || `group-${index}`;
    groups.push({
      id,
      title: asString(rawGroup.title) || `Group ${index + 1}`,
      description: asString(rawGroup.description),
      impact: asString(rawGroup.impact),
      // Tolerant: absent on analyses cached before `details` existed → "".
      details: asString(rawGroup.details),
      filenames,
      additions,
      deletions,
    });
  });

  // Per-file metadata, only for real files. The wire contract is an array of
  // { filename, risk, complexity, summary } (strict-schema compatible), but we
  // also accept a { filename: {...} } map for tolerance.
  const fileMeta: Record<string, FileAnalysisMeta> = {};
  const addMeta = (filename: unknown, value: unknown) => {
    if (typeof filename !== "string" || !known.has(filename)) return;
    if (typeof value !== "object" || value === null) return;
    const m = value as {
      risk?: unknown;
      complexity?: unknown;
      summary?: unknown;
    };
    fileMeta[filename] = {
      risk: coerceLevel(m.risk),
      complexity: coerceLevel(m.complexity),
      summary: asString(m.summary),
    };
  };

  if (Array.isArray(root.fileMeta)) {
    for (const item of root.fileMeta) {
      if (typeof item === "object" && item !== null) {
        addMeta((item as { filename?: unknown }).filename, item);
      }
    }
  } else if (typeof root.fileMeta === "object" && root.fileMeta !== null) {
    for (const [filename, value] of Object.entries(
      root.fileMeta as Record<string, unknown>
    )) {
      addMeta(filename, value);
    }
  }

  return { groups, fileMeta };
}
