import type { SelectedLineRange, AnnotationSide } from "@pierre/diffs";

/** pulldash's store models a line side as old/new; Pierre as deletions/additions. */
export type StoreSide = "old" | "new";

export function sideToPierre(side: StoreSide | null): AnnotationSide {
  return side === "old" ? "deletions" : "additions";
}

export function sideFromPierre(side: AnnotationSide | undefined): StoreSide {
  return side === "deletions" ? "old" : "new";
}

export interface StoreSelection {
  focusedLine: number | null;
  focusedLineSide: StoreSide | null;
  selectionAnchor: number | null;
  selectionAnchorSide: StoreSide | null;
}

export interface StoreSelectionWrite {
  focusedLine: number | null;
  focusedLineSide: StoreSide;
  selectionAnchor: number | null;
  selectionAnchorSide: StoreSide;
}

/**
 * Store selection → Pierre's controlled `selectedLines`. Pierre wants an ordered
 * range (`start <= end`) but keeps a per-endpoint side, so we order the anchor
 * and focus while preserving each one's side.
 */
export function storeToPierreSelection(
  sel: StoreSelection
): SelectedLineRange | null {
  const { focusedLine, focusedLineSide, selectionAnchor, selectionAnchorSide } =
    sel;
  if (focusedLine == null) return null;

  const focusSide = sideToPierre(focusedLineSide);
  if (selectionAnchor == null) {
    return {
      start: focusedLine,
      end: focusedLine,
      side: focusSide,
      endSide: focusSide,
    };
  }

  const anchorSide = sideToPierre(selectionAnchorSide);
  return selectionAnchor <= focusedLine
    ? {
        start: selectionAnchor,
        side: anchorSide,
        end: focusedLine,
        endSide: focusSide,
      }
    : {
        start: focusedLine,
        side: focusSide,
        end: selectionAnchor,
        endSide: anchorSide,
      };
}

/**
 * Pierre selection-change → store endpoints. Pierre reports a line-ordered range;
 * we treat `end` as the focus and `start` as the anchor. A collapsed range
 * (start === end) clears the anchor so it reads as a single focused line.
 *
 * Because Pierre's range is ordered, an upward store selection (anchor above
 * focus) is preserved as a *span* but its anchor/focus labels normalize here to
 * focus=higher line. That span is all the comment-range and highlight consume;
 * anchor/focus identity only matters for keyboard shift-extend, which the Pierre
 * pane does not yet wire.
 */
export function pierreRangeToStore(
  range: SelectedLineRange | null
): StoreSelectionWrite {
  if (!range) {
    return {
      focusedLine: null,
      focusedLineSide: "new",
      selectionAnchor: null,
      selectionAnchorSide: "new",
    };
  }

  const startSide = sideFromPierre(range.side);
  const endSide = sideFromPierre(range.endSide ?? range.side);
  return {
    focusedLine: range.end,
    focusedLineSide: endSide,
    selectionAnchor: range.start === range.end ? null : range.start,
    selectionAnchorSide: startSide,
  };
}
