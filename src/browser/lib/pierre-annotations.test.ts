import { test, expect } from "bun:test";
import type { ReviewComment } from "@/api/types";
import type { LocalPendingComment } from "@/browser/contexts/pr-review";
import { buildCommentAnnotations } from "./pierre-annotations";

function comment(
  overrides: Partial<ReviewComment> & { id: number }
): ReviewComment {
  return overrides as ReviewComment;
}

test("threads review comments by in_reply_to_id, anchored at the root line/side", () => {
  const anns = buildCommentAnnotations(
    [
      comment({ id: 1, line: 10, side: "RIGHT" }),
      comment({ id: 2, line: 10, in_reply_to_id: 1, side: "RIGHT" }),
      comment({ id: 3, line: 4, side: "LEFT" }),
    ],
    [],
    null
  );

  expect(anns).toHaveLength(2);
  const thread10 = anns.find((a) => a.lineNumber === 10)!;
  expect(thread10.side).toBe("additions");
  expect(thread10.metadata.kind).toBe("thread");
  if (thread10.metadata.kind === "thread") {
    expect(thread10.metadata.comments.map((c) => c.id)).toEqual([1, 2]);
  }
  const thread4 = anns.find((a) => a.lineNumber === 4)!;
  expect(thread4.side).toBe("deletions"); // LEFT → deletions
});

test("falls back to original_line when line is null", () => {
  const anns = buildCommentAnnotations(
    [
      comment({
        id: 5,
        line: null as unknown as number,
        original_line: 7,
        side: "RIGHT",
      }),
    ],
    [],
    null
  );
  expect(anns[0]?.lineNumber).toBe(7);
});

test("emits a pending annotation per unsubmitted comment", () => {
  const pending: LocalPendingComment = {
    id: "p1",
    path: "a.ts",
    line: 12,
    body: "wip",
    side: "LEFT",
  };
  const anns = buildCommentAnnotations([], [pending], null);
  expect(anns).toHaveLength(1);
  expect(anns[0]).toMatchObject({ lineNumber: 12, side: "deletions" });
  expect(anns[0]?.metadata.kind).toBe("pending");
});

test("emits a form annotation for the active compose line", () => {
  const anns = buildCommentAnnotations([], [], { line: 20, startLine: 18 });
  expect(anns).toHaveLength(1);
  expect(anns[0]).toMatchObject({ lineNumber: 20, side: "additions" });
  if (anns[0]?.metadata.kind === "form") {
    expect(anns[0].metadata.startLine).toBe(18);
  }
});

test("skips root comments with no resolvable line", () => {
  const anns = buildCommentAnnotations(
    [
      comment({
        id: 9,
        line: null as unknown as number,
        original_line: null as unknown as number,
      }),
    ],
    [],
    null
  );
  expect(anns).toHaveLength(0);
});
