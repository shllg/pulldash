import { test, expect } from "bun:test";
import {
  sideToPierre,
  sideFromPierre,
  storeToPierreSelection,
  pierreRangeToStore,
} from "./pierre-selection";

test("side maps round-trip between store and Pierre", () => {
  expect(sideToPierre("old")).toBe("deletions");
  expect(sideToPierre("new")).toBe("additions");
  expect(sideToPierre(null)).toBe("additions");
  expect(sideFromPierre("deletions")).toBe("old");
  expect(sideFromPierre("additions")).toBe("new");
  expect(sideFromPierre(undefined)).toBe("new");
});

test("storeToPierreSelection: null focus → no selection", () => {
  expect(
    storeToPierreSelection({
      focusedLine: null,
      focusedLineSide: null,
      selectionAnchor: null,
      selectionAnchorSide: null,
    })
  ).toBeNull();
});

test("storeToPierreSelection: single focused line collapses to same start/end", () => {
  expect(
    storeToPierreSelection({
      focusedLine: 12,
      focusedLineSide: "new",
      selectionAnchor: null,
      selectionAnchorSide: null,
    })
  ).toEqual({ start: 12, end: 12, side: "additions", endSide: "additions" });
});

test("storeToPierreSelection orders anchor/focus while preserving each side", () => {
  // focus above anchor → focus becomes start
  expect(
    storeToPierreSelection({
      focusedLine: 5,
      focusedLineSide: "old",
      selectionAnchor: 9,
      selectionAnchorSide: "new",
    })
  ).toEqual({ start: 5, side: "deletions", end: 9, endSide: "additions" });

  // anchor above focus → anchor becomes start
  expect(
    storeToPierreSelection({
      focusedLine: 9,
      focusedLineSide: "new",
      selectionAnchor: 5,
      selectionAnchorSide: "old",
    })
  ).toEqual({ start: 5, side: "deletions", end: 9, endSide: "additions" });
});

test("pierreRangeToStore: null clears selection", () => {
  expect(pierreRangeToStore(null)).toEqual({
    focusedLine: null,
    focusedLineSide: "new",
    selectionAnchor: null,
    selectionAnchorSide: "new",
  });
});

test("pierreRangeToStore: collapsed range → focus only, no anchor", () => {
  expect(
    pierreRangeToStore({
      start: 7,
      end: 7,
      side: "additions",
      endSide: "additions",
    })
  ).toEqual({
    focusedLine: 7,
    focusedLineSide: "new",
    selectionAnchor: null,
    selectionAnchorSide: "new",
  });
});

test("pierreRangeToStore: multi-line range keeps both endpoints + sides", () => {
  expect(
    pierreRangeToStore({
      start: 3,
      side: "deletions",
      end: 8,
      endSide: "additions",
    })
  ).toEqual({
    focusedLine: 8,
    focusedLineSide: "new",
    selectionAnchor: 3,
    selectionAnchorSide: "old",
  });
});

test("round-trips cleanly when the store anchor is below the focus", () => {
  const pierre = storeToPierreSelection({
    focusedLine: 20,
    focusedLineSide: "new",
    selectionAnchor: 14,
    selectionAnchorSide: "new",
  });
  expect(pierreRangeToStore(pierre)).toEqual({
    focusedLine: 20,
    focusedLineSide: "new",
    selectionAnchor: 14,
    selectionAnchorSide: "new",
  });
});

test("normalizes anchor/focus to focus=higher line when the anchor is above the focus", () => {
  // Pierre's range is line-ordered, so an upward store selection (anchor below,
  // focus above) is preserved as a *range* but its anchor/focus labels normalize
  // on the way back — focus becomes the higher line. The selected span (14–20)
  // is unchanged, which is all the comment-range and highlight consume.
  const pierre = storeToPierreSelection({
    focusedLine: 14,
    focusedLineSide: "new",
    selectionAnchor: 20,
    selectionAnchorSide: "new",
  });
  expect(pierre).toEqual({
    start: 14,
    side: "additions",
    end: 20,
    endSide: "additions",
  });
  expect(pierreRangeToStore(pierre)).toEqual({
    focusedLine: 20,
    focusedLineSide: "new",
    selectionAnchor: 14,
    selectionAnchorSide: "new",
  });
});
