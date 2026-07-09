import { memo, useMemo } from "react";
import { Check, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "../cn";
import { Markdown } from "../ui/markdown";
import {
  usePRReviewSelector,
  usePRReviewStore,
  type AnalysisGroup,
} from "../contexts/pr-review";
import { LevelBadge, OTHER_GROUP_ID, filesForTopic } from "./file-tree";

// Synthetic "Other changes" group — the sidebar builds it inline (files not
// claimed by any codex group); the detail view degrades gracefully (no
// details/description/impact, read-only-ish).
const OTHER_GROUP: AnalysisGroup = {
  id: OTHER_GROUP_ID,
  title: "Other changes",
  description: "",
  impact: "",
  details: "",
  filenames: [],
  additions: 0,
  deletions: 0,
};

/**
 * Topic detail view — the main-pane counterpart to a file diff, opened by
 * selecting a topic in the sidebar. Renders the topic's rich `details` markdown
 * (falling back to description + impact for analyses cached before `details`
 * existed), its file list with risk/complexity badges and per-file summaries,
 * and a mark-viewed / next-topic control. Off the hot diff render path.
 */
export const TopicDetail = memo(function TopicDetail() {
  const store = usePRReviewStore();
  const selectedTopic = usePRReviewSelector((s) => s.selectedTopic);
  const analysis = usePRReviewSelector((s) => s.analysis);
  const files = usePRReviewSelector((s) => s.files);
  const viewedTopics = usePRReviewSelector((s) => s.viewedTopics);

  const groups = analysis?.groups;
  const fileMeta = analysis?.fileMeta;

  const group: AnalysisGroup | null = useMemo(() => {
    if (!selectedTopic) return null;
    if (selectedTopic === OTHER_GROUP_ID) return OTHER_GROUP;
    return groups?.find((g) => g.id === selectedTopic) ?? null;
  }, [selectedTopic, groups]);

  const topicFiles = useMemo(
    () =>
      selectedTopic && groups
        ? filesForTopic(selectedTopic, groups, files)
        : [],
    [selectedTopic, groups, files]
  );

  // Ordered, non-empty topic ids (mirrors the sidebar), plus the synthetic
  // "Other" bucket when uncovered files exist — drives the Next control.
  const topicOrder = useMemo(() => {
    if (!groups) return [];
    const ids = groups
      .filter((g) => filesForTopic(g.id, groups, files).length > 0)
      .map((g) => g.id);
    if (filesForTopic(OTHER_GROUP_ID, groups, files).length > 0) {
      ids.push(OTHER_GROUP_ID);
    }
    return ids;
  }, [groups, files]);

  // A real group always has ≥1 file (empty groups aren't selectable), so an
  // empty topicFiles means a stale selection — e.g. the synthetic "Other" bucket
  // after a re-analysis reclaimed every previously-uncovered file. Degrade the
  // same way a missing real group does, rather than showing an empty pane.
  if (!selectedTopic || !group || topicFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Topic not found — it may have changed after re-analyzing.
      </div>
    );
  }

  const additions = topicFiles.reduce((s, f) => s + (f.additions ?? 0), 0);
  const deletions = topicFiles.reduce((s, f) => s + (f.deletions ?? 0), 0);
  const isViewed = viewedTopics.has(group.id);

  const details = group.details?.trim() ? group.details : null;
  const fallback = [group.description, group.impact]
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n");

  const nextTopic = () => {
    if (topicOrder.length < 2) return;
    // idx === -1 (current topic not in the ordered list) falls back to the first.
    const idx = topicOrder.indexOf(group.id);
    const next = topicOrder[idx === -1 ? 0 : (idx + 1) % topicOrder.length];
    store.selectTopic(next);
  };

  return (
    <div className="flex-1 overflow-auto themed-scrollbar">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header: title + rollup, mark-viewed / next controls */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">{group.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {topicFiles.length} file{topicFiles.length !== 1 ? "s" : ""}
              </span>
              <span className="font-mono text-green-500">+{additions}</span>
              <span className="font-mono text-red-500">−{deletions}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => store.toggleTopicViewed(group.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors",
                isViewed
                  ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25"
                  : "bg-muted/50 border-border hover:bg-muted"
              )}
            >
              <Check className="w-3.5 h-3.5" />
              {isViewed ? "Viewed" : "Mark viewed"}
            </button>
            {topicOrder.length > 1 && (
              <button
                onClick={nextTopic}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors"
              >
                Next topic
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Rich details (markdown), with graceful fallback + re-analyze hint */}
        <div className="mt-4">
          {details ? (
            <Markdown className="text-sm">{details}</Markdown>
          ) : fallback ? (
            <>
              <Markdown className="text-sm">{fallback}</Markdown>
              <p className="mt-2 text-xs text-muted-foreground/70 italic">
                Re-analyze for a fuller summary.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No summary available for this topic.
            </p>
          )}
        </div>

        {/* File list — click a row to open its diff */}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Files
          </h2>
          <ul className="flex flex-col gap-1">
            {topicFiles.map((f) => {
              const meta = fileMeta?.[f.filename];
              return (
                <li key={f.filename}>
                  <button
                    onClick={() => store.selectFile(f.filename)}
                    className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-mono">
                          {f.filename}
                        </span>
                        {meta && (
                          <span className="flex items-center gap-1 shrink-0">
                            <LevelBadge kind="Risk" level={meta.risk} />
                            <LevelBadge
                              kind="Complexity"
                              level={meta.complexity}
                            />
                          </span>
                        )}
                      </div>
                      {meta?.summary && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {meta.summary}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-[10px] font-mono">
                      <span className="text-green-500">
                        +{f.additions ?? 0}
                      </span>{" "}
                      <span className="text-red-500">−{f.deletions ?? 0}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
});
