import { test, expect } from "bun:test";
import { analysisCacheKey, parseSSEChunk } from "./useAnalysisLoader";

test("analysisCacheKey encodes owner/repo/number and base+head SHAs", () => {
  expect(analysisCacheKey("acme", "widgets", 42, "abc123", "def456")).toBe(
    "analysis:acme/widgets/42:abc123:def456"
  );
});

test("analysisCacheKey distinguishes a base retarget with the same head", () => {
  const a = analysisCacheKey("o", "r", 1, "head", "baseA");
  const b = analysisCacheKey("o", "r", 1, "head", "baseB");
  expect(a).not.toBe(b);
});

test("parseSSEChunk extracts complete events and returns the partial tail", () => {
  const buffer =
    'data: {"type":"progress","message":"Cloning…"}\n\n' +
    'data: {"type":"done","analysis":{"groups":[],"fileMeta":{}}}\n\n' +
    'data: {"type":"progress","message":"partial'; // no terminator yet

  const { events, rest } = parseSSEChunk(buffer);

  expect(events).toHaveLength(2);
  expect(events[0]).toEqual({ type: "progress", message: "Cloning…" });
  expect(events[1].type).toBe("done");
  // the incomplete frame is preserved for the next chunk
  expect(rest).toBe('data: {"type":"progress","message":"partial');
});

test("parseSSEChunk resumes across chunk boundaries", () => {
  const first = parseSSEChunk('data: {"type":"progress",');
  expect(first.events).toHaveLength(0);

  const combined = first.rest + '"message":"Checking out…"}\n\n';
  const second = parseSSEChunk(combined);
  expect(second.events).toEqual([
    { type: "progress", message: "Checking out…" },
  ]);
  expect(second.rest).toBe("");
});

test("parseSSEChunk surfaces the error event", () => {
  const { events } = parseSSEChunk(
    'data: {"type":"error","message":"codex failed to start: ENOENT"}\n\n'
  );
  expect(events[0]).toEqual({
    type: "error",
    message: "codex failed to start: ENOENT",
  });
});

test("parseSSEChunk skips malformed frames without dropping later events", () => {
  const buffer =
    "data: not-json\n\n" +
    'data: {"type":"done","analysis":{"groups":[],"fileMeta":{}}}\n\n';
  const { events } = parseSSEChunk(buffer);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe("done");
});
