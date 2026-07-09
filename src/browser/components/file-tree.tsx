import { useMemo, useState, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight,
  ChevronDown,
  File,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Check,
  MessageSquare,
  Copy,
  Eye,
  EyeOff,
  GitBranch,
  FolderCheck,
} from "lucide-react";
import { cn } from "../cn";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import type { PullRequestFile } from "@/api/types";
import {
  sortFilesLikeTree,
  type AnalysisGroup,
  type AnalysisLevel,
  type FileAnalysisMeta,
  type GroupByMode,
} from "@/browser/contexts/pr-review";

interface FileTreeProps {
  files: PullRequestFile[];
  selectedFile: string | null;
  selectedFiles: Set<string>;
  viewedFiles: Set<string>;
  hideViewed: boolean;
  commentCounts: Record<string, number>;
  pendingCommentCounts?: Record<string, number>;
  // Semantic analysis (codex topic grouping). When groupByMode==="topics" and
  // groups are present, the tree is replaced by topic groups + risk badges.
  groupByMode?: GroupByMode;
  groups?: readonly AnalysisGroup[];
  fileMeta?: Record<string, FileAnalysisMeta>;
  onSelectFile: (filename: string) => void;
  onToggleFileSelection: (filename: string, isShiftClick: boolean) => void;
  onToggleViewed: (filename: string) => void;
  onToggleViewedMultiple: (filenames: string[]) => void;
  onMarkFolderViewed: (
    folderPath: string,
    filenames: string[],
    markAsViewed: boolean
  ) => void;
  onCopyDiff: (filename: string) => void;
  onCopyFile: (filename: string) => void;
  onCopyMainVersion: (filename: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  file?: PullRequestFile;
}

// Flattened item for virtualization. Either a tree node (file/folder) or a
// topic group header. `"group" in item` narrows to the header variant.
interface NodeFlatItem {
  node: TreeNode;
  depth: number;
  // For folders: list of all file paths under this folder
  filesInFolder?: string[];
}
interface GroupFlatItem {
  group: AnalysisGroup;
  additions: number;
  deletions: number;
  fileCount: number;
  collapsed: boolean;
}
type FlatItem = NodeFlatItem | GroupFlatItem;

function isGroupHeader(item: FlatItem): item is GroupFlatItem {
  return "group" in item;
}

const OTHER_GROUP_ID = "__other__";

// Build the flat, virtualizable model for Topics mode: a header row per group
// followed by its (optionally collapsed) file rows. Files not referenced by any
// group are collected into a trailing "Other changes" group so every file stays
// reachable. Rollup +/- counts are computed from PullRequestFile data — never
// trusted from the model. Pure + exported for data-layer testing.
export function buildTopicsFlat(
  files: PullRequestFile[],
  groups: readonly AnalysisGroup[],
  viewedFiles: Set<string>,
  hideViewed: boolean,
  collapsedGroups: Set<string>
): FlatItem[] {
  const byName = new Map(files.map((f) => [f.filename, f]));
  const used = new Set<string>();
  const items: FlatItem[] = [];

  const pushGroup = (group: AnalysisGroup, groupFiles: PullRequestFile[]) => {
    const visible = hideViewed
      ? groupFiles.filter((f) => !viewedFiles.has(f.filename))
      : groupFiles;
    // Hide a group whose files are all viewed (mirrors folder hide-viewed).
    if (visible.length === 0) return;
    const additions = groupFiles.reduce((s, f) => s + (f.additions ?? 0), 0);
    const deletions = groupFiles.reduce((s, f) => s + (f.deletions ?? 0), 0);
    const collapsed = collapsedGroups.has(group.id);
    items.push({
      group,
      additions,
      deletions,
      fileCount: groupFiles.length,
      collapsed,
    });
    if (collapsed) return;
    for (const f of visible) {
      items.push({
        node: {
          name: f.filename.split("/").pop() ?? f.filename,
          path: f.filename,
          type: "file",
          file: f,
        },
        depth: 1,
      });
    }
  };

  for (const group of groups) {
    const groupFiles: PullRequestFile[] = [];
    for (const name of group.filenames) {
      if (used.has(name)) continue;
      const file = byName.get(name);
      if (file) {
        groupFiles.push(file);
        used.add(name);
      }
    }
    pushGroup(group, groupFiles);
  }

  const uncovered = sortFilesLikeTree(
    files.filter((f) => !used.has(f.filename))
  );
  if (uncovered.length > 0) {
    pushGroup(
      {
        id: OTHER_GROUP_ID,
        title: "Other changes",
        description: "",
        impact: "",
        filenames: uncovered.map((f) => f.filename),
        additions: 0,
        deletions: 0,
      },
      uncovered
    );
  }

  return items;
}

function buildTree(files: PullRequestFile[]): TreeNode[] {
  const root: Record<string, TreeNode> = {};

  for (const file of files) {
    const parts = file.filename.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      if (!current[part]) {
        current[part] = {
          name: part,
          path,
          type: isLast ? "file" : "folder",
          children: isLast ? undefined : {},
          file: isLast ? file : undefined,
        } as TreeNode & { children: Record<string, TreeNode> };
      }

      if (!isLast) {
        current = (
          current[part] as TreeNode & { children: Record<string, TreeNode> }
        ).children!;
      }
    }
  }

  function convertToArray(obj: Record<string, TreeNode>): TreeNode[] {
    return Object.values(obj)
      .map((node) => ({
        ...node,
        children: node.children
          ? convertToArray(node.children as unknown as Record<string, TreeNode>)
          : undefined,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  return convertToArray(root);
}

function getFileIcon(file: PullRequestFile) {
  switch (file.status) {
    case "added":
      return <FilePlus className="w-4 h-4 text-green-500" />;
    case "removed":
      return <FileMinus className="w-4 h-4 text-red-500" />;
    case "modified":
    case "changed":
      return <FileEdit className="w-4 h-4 text-yellow-500" />;
    case "renamed":
      return <FileCode className="w-4 h-4 text-blue-500" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
}

const LEVEL_CLASS: Record<AnalysisLevel, string> = {
  high: "text-red-400 bg-red-500/15",
  medium: "text-yellow-400 bg-yellow-500/15",
  low: "text-green-400 bg-green-500/15",
};

// Compact risk/complexity badge (single colored letter + tooltip). Kept tiny so
// it fits alongside the (truncated) filename in the 256px sidebar.
function LevelBadge({
  kind,
  level,
}: {
  kind: "Risk" | "Complexity";
  level: AnalysisLevel;
}) {
  return (
    <span
      title={`${kind}: ${level}`}
      className={cn(
        "text-[10px] leading-none px-1 py-0.5 rounded font-semibold uppercase shrink-0",
        LEVEL_CLASS[level]
      )}
    >
      {kind[0]}
      {level[0]}
    </span>
  );
}

// Helper to collect all file paths under a folder
function collectFilesInFolder(node: TreeNode): string[] {
  if (node.type === "file") {
    return [node.path];
  }
  if (node.children) {
    return node.children.flatMap(collectFilesInFolder);
  }
  return [];
}

// Filter tree to only show non-viewed files
function filterTree(nodes: TreeNode[], viewedFiles: Set<string>): TreeNode[] {
  return nodes
    .map((node) => {
      if (node.type === "file") {
        return viewedFiles.has(node.path) ? null : node;
      }
      // For folders, recursively filter children
      const filteredChildren = node.children
        ? filterTree(node.children, viewedFiles)
        : [];
      // Only include folder if it has non-viewed children
      if (filteredChildren.length === 0) {
        return null;
      }
      return { ...node, children: filteredChildren };
    })
    .filter((node): node is TreeNode => node !== null);
}

// Flatten tree into a list of visible items based on expansion state
function flattenTree(
  nodes: TreeNode[],
  expandedFolders: Set<string>,
  depth = 0
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const node of nodes) {
    if (node.type === "folder") {
      const filesInFolder = collectFilesInFolder(node);
      items.push({ node, depth, filesInFolder });

      // Only include children if folder is expanded
      if (expandedFolders.has(node.path) && node.children) {
        items.push(...flattenTree(node.children, expandedFolders, depth + 1));
      }
    } else {
      items.push({ node, depth });
    }
  }

  return items;
}

const ROW_HEIGHT = 28; // Height of each file/folder row in pixels
const GROUP_HEADER_HEIGHT = 64; // Taller row for a topic group header

// Stable fallbacks so default props don't churn the topics useMemo each render.
const EMPTY_GROUPS: readonly AnalysisGroup[] = [];
const EMPTY_META: Record<string, FileAnalysisMeta> = {};

export function FileTree({
  files,
  selectedFile,
  selectedFiles,
  viewedFiles,
  hideViewed,
  commentCounts,
  pendingCommentCounts = {},
  groupByMode = "tree",
  groups = EMPTY_GROUPS,
  fileMeta = EMPTY_META,
  onSelectFile,
  onToggleFileSelection,
  onToggleViewed,
  onToggleViewedMultiple,
  onMarkFolderViewed,
  onCopyDiff,
  onCopyFile,
  onCopyMainVersion,
}: FileTreeProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Topics layout only applies when analysis groups exist; otherwise fall back
  // to the tree so the sidebar is always well-defined.
  const topicsMode = groupByMode === "topics" && groups.length > 0;

  const tree = useMemo(() => buildTree(files), [files]);
  const filteredTree = useMemo(
    () => (hideViewed ? filterTree(tree, viewedFiles) : tree),
    [tree, hideViewed, viewedFiles]
  );

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.filename.split("/");
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join("/"));
      }
    }
    return folders;
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Flatten the active model for virtualization (tree or topics).
  const flatItems = useMemo(
    () =>
      topicsMode
        ? buildTopicsFlat(
            files,
            groups,
            viewedFiles,
            hideViewed,
            collapsedGroups
          )
        : flattenTree(filteredTree, expandedFolders),
    [
      topicsMode,
      files,
      groups,
      viewedFiles,
      hideViewed,
      collapsedGroups,
      filteredTree,
      expandedFolders,
    ]
  );

  // Create index for scrolling to selected file
  const selectedIndex = useMemo(() => {
    if (!selectedFile) return -1;
    return flatItems.findIndex(
      (item) =>
        !isGroupHeader(item) &&
        item.node.type === "file" &&
        item.node.path === selectedFile
    );
  }, [flatItems, selectedFile]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      isGroupHeader(flatItems[index]) ? GROUP_HEADER_HEIGHT : ROW_HEIGHT,
    overscan: 20,
  });

  // Scroll selected file into view
  const lastScrolledToRef = useRef<string | null>(null);
  if (
    selectedFile &&
    selectedIndex >= 0 &&
    lastScrolledToRef.current !== selectedFile
  ) {
    lastScrolledToRef.current = selectedFile;
    // Use requestAnimationFrame to ensure virtualizer is ready
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(selectedIndex, {
        align: "center",
        behavior: "auto",
      });
    });
  }

  const handleItemClick = useCallback(
    (item: FlatItem, e: React.MouseEvent) => {
      if (isGroupHeader(item)) return;
      if (item.node.type === "file") {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onToggleFileSelection(item.node.path, e.shiftKey);
        } else {
          onSelectFile(item.node.path);
        }
      } else {
        toggleFolder(item.node.path);
      }
    },
    [onSelectFile, onToggleFileSelection, toggleFolder]
  );

  if (flatItems.length === 0) {
    return (
      <nav className="flex-1 overflow-auto py-2 themed-scrollbar">
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {hideViewed ? "All files reviewed!" : "No files"}
        </div>
      </nav>
    );
  }

  return (
    <nav ref={parentRef} className="flex-1 overflow-auto py-2 themed-scrollbar">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flatItems[virtualRow.index];
          if (!item) return null;

          // Topic group header row
          if (isGroupHeader(item)) {
            const { group, additions, deletions, collapsed } = item;
            return (
              <div
                key={`group:${group.id}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full h-full flex flex-col justify-center gap-0.5 px-2 py-1 text-left border-b border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    {collapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate flex-1 text-xs font-semibold">
                      {group.title}
                    </span>
                    <span className="text-[10px] font-mono text-green-500 shrink-0">
                      +{additions}
                    </span>
                    <span className="text-[10px] font-mono text-red-500 shrink-0">
                      −{deletions}
                    </span>
                  </div>
                  {group.description && (
                    <span className="truncate text-[11px] text-muted-foreground pl-5">
                      {group.description}
                    </span>
                  )}
                  {group.impact && (
                    <span className="truncate text-[11px] text-muted-foreground/80 italic pl-5">
                      {group.impact}
                    </span>
                  )}
                </button>
              </div>
            );
          }

          const { node, depth, filesInFolder } = item;

          if (node.type === "folder") {
            const isExpanded = expandedFolders.has(node.path);
            const viewedCount = filesInFolder
              ? filesInFolder.filter((f) => viewedFiles.has(f)).length
              : 0;
            const allViewed =
              filesInFolder && viewedCount === filesInFolder.length;

            return (
              <div
                key={node.path}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={(e) => handleItemClick(item, e)}
                      className={cn(
                        "w-full flex items-center gap-1 px-2 text-sm hover:bg-muted/50 transition-colors",
                        "text-left h-full"
                      )}
                      style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate flex-1">{node.name}</span>
                      {allViewed && (
                        <Check className="w-3 h-3 text-green-500 shrink-0" />
                      )}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() =>
                        onMarkFolderViewed(
                          node.path,
                          filesInFolder || [],
                          !allViewed
                        )
                      }
                    >
                      {allViewed ? (
                        <>
                          <EyeOff className="w-4 h-4 mr-2" />
                          Mark all as unviewed ({filesInFolder?.length ||
                            0}{" "}
                          files)
                        </>
                      ) : (
                        <>
                          <FolderCheck className="w-4 h-4 mr-2" />
                          Mark all as viewed ({filesInFolder?.length || 0}{" "}
                          files)
                        </>
                      )}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            );
          }

          // File item
          const isSelected = selectedFile === node.path;
          const isMultiSelected = selectedFiles.has(node.path);
          const isViewed = viewedFiles.has(node.path);
          const commentCount = commentCounts[node.path] || 0;
          const pendingCount = pendingCommentCounts[node.path] || 0;
          const meta = topicsMode ? fileMeta[node.path] : undefined;
          const showMultiSelectMenu =
            selectedFiles.size > 1 && selectedFiles.has(node.path);

          return (
            <div
              key={node.path}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={(e) => handleItemClick(item, e)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 text-sm transition-colors",
                      "text-left hover:bg-muted/50 h-full",
                      isSelected && "bg-muted",
                      isMultiSelected && !isSelected && "bg-blue-500/20",
                      isViewed && !isMultiSelected && "opacity-60"
                    )}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                  >
                    {node.file && getFileIcon(node.file)}
                    <span className="truncate flex-1">{node.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {meta && (
                        <>
                          <LevelBadge kind="Risk" level={meta.risk} />
                          <LevelBadge
                            kind="Complexity"
                            level={meta.complexity}
                          />
                        </>
                      )}
                      {pendingCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-yellow-500 bg-yellow-500/20 px-1.5 py-0.5 rounded">
                          {pendingCount}
                        </span>
                      )}
                      {commentCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          {commentCount}
                        </span>
                      )}
                      {isViewed && <Check className="w-3 h-3 text-green-500" />}
                    </div>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {showMultiSelectMenu ? (
                    <ContextMenuItem
                      onClick={() => onToggleViewedMultiple([...selectedFiles])}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Toggle viewed ({selectedFiles.size} files)
                    </ContextMenuItem>
                  ) : (
                    <>
                      <ContextMenuItem
                        onClick={() => onToggleViewed(node.path)}
                      >
                        {isViewed ? (
                          <>
                            <EyeOff className="w-4 h-4 mr-2" />
                            Mark as unviewed
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            Mark as viewed
                          </>
                        )}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => onCopyDiff(node.path)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy diff
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onCopyFile(node.path)}>
                        <FileCode className="w-4 h-4 mr-2" />
                        Copy file (PR version)
                      </ContextMenuItem>
                      {node.file?.status !== "added" && (
                        <ContextMenuItem
                          onClick={() => onCopyMainVersion(node.path)}
                        >
                          <GitBranch className="w-4 h-4 mr-2" />
                          Copy file (base version)
                        </ContextMenuItem>
                      )}
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
