// Node-only: run `codex exec` non-interactively inside a repo checkout and
// return its final message (expected JSON per --output-schema).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANALYSIS_JSON_SCHEMA } from "./prompt";

const DEFAULT_TIMEOUT_MS = 180_000;

export interface RunCodexInput {
  repoDir: string;
  prompt: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Spawn codex against `repoDir`. Uses a read-only sandbox (codex only needs to
 * read files + run git diff) and writes the final structured message to a temp
 * file via `-o`, which we read back. Fail-closed: missing binary, non-zero exit,
 * timeout, or abort all reject.
 */
export async function runCodex(input: RunCodexInput): Promise<string> {
  const workdir = mkdtempSync(join(tmpdir(), "pulldash-analyze-"));
  const schemaPath = join(workdir, "schema.json");
  const outPath = join(workdir, "out.txt");
  writeFileSync(schemaPath, JSON.stringify(ANALYSIS_JSON_SCHEMA));

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const args = [
        "exec",
        "-C",
        input.repoDir,
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--color",
        "never",
        "--output-schema",
        schemaPath,
        "-o",
        outPath,
        input.prompt,
      ];

      input.onProgress?.("Running codex analysis…");
      const child = spawn("codex", args, {
        cwd: input.repoDir,
        signal: input.signal,
      });

      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("codex analysis timed out"));
      }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        // ENOENT → codex not installed / not on PATH.
        reject(new Error(`codex failed to start: ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolvePromise();
        else
          reject(new Error(stderr.trim() || `codex exited with code ${code}`));
      });
    });

    return readFileSync(outPath, "utf-8");
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}
