import { test, expect } from "bun:test";
import type { PullRequestFile } from "@/api/types";
import { buildPierreFileDiff } from "./pierre-diff";

// The adapter only reads `filename` and `previous_filename`; a minimal shape is
// enough to exercise the data-layer seam without a live GitHub response.
function file(
  overrides: Partial<PullRequestFile> & { filename: string }
): PullRequestFile {
  return overrides as PullRequestFile;
}

test("buildPierreFileDiff derives a modified-file diff from full contents", () => {
  const md = buildPierreFileDiff(
    file({ filename: "src/foo.ts" }),
    "line1\nline2\nline3\n",
    "line1\nline2 changed\nline3\nline4\n"
  );

  expect(md.type).toBe("change");
  expect(md.name).toBe("src/foo.ts");
  // Full contents (not a partial patch) → hunk expansion + whole-file highlight.
  expect(md.isPartial).toBe(false);
  expect(md.hunks.length).toBeGreaterThan(0);
  expect(md.deletionLines.length).toBe(3);
  expect(md.additionLines.length).toBe(4);
});

test("buildPierreFileDiff marks an added file as new", () => {
  const md = buildPierreFileDiff(
    file({ filename: "src/new.ts", status: "added" }),
    "",
    "a\nb\n"
  );

  expect(md.type).toBe("new");
  expect(md.hunks.length).toBeGreaterThan(0);
});

test("buildPierreFileDiff marks a removed file as deleted", () => {
  const md = buildPierreFileDiff(
    file({ filename: "src/gone.ts", status: "removed" }),
    "a\nb\n",
    ""
  );

  expect(md.type).toBe("deleted");
  expect(md.hunks.length).toBeGreaterThan(0);
});

test("buildPierreFileDiff addresses the old side by previous_filename on rename", () => {
  const md = buildPierreFileDiff(
    file({
      filename: "src/renamed.ts",
      previous_filename: "src/original.ts",
      status: "renamed",
    }),
    "same\n",
    "same\ndifferent\n"
  );

  expect(md.name).toBe("src/renamed.ts");
  expect(md.prevName).toBe("src/original.ts");
});
