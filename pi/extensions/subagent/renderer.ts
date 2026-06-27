/**
 * renderer.ts — TUI widget rendering for subagent status display.
 *
 * Renders active subagents as compact status lines in a widget
 * placed above the editor.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SubagentRecord } from "./types";

// ---------------------------------------------------------------------------
// Status icons and labels
// ---------------------------------------------------------------------------

type ThemeColorName = "success" | "error" | "warning" | "muted" | "accent" | "dim";

const STATE_CONFIG: Record<
  string,
  { icon: string; label: string; color: ThemeColorName }
> = {
  running: { icon: "⏳", label: "running", color: "warning" },
  completed: { icon: "✓", label: "done", color: "success" },
  error: { icon: "✗", label: "error", color: "error" },
  killed: { icon: "⊘", label: "killed", color: "muted" },
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m${remainSecs}s`;
}

// ---------------------------------------------------------------------------
// Widget renderer
// ---------------------------------------------------------------------------

export interface SubagentWidgetContent {
  render(width: number): string[];
  invalidate(): void;
}

// ---------------------------------------------------------------------------
// Depth-based indentation helpers
// ---------------------------------------------------------------------------

/**
 * Build the indentation prefix for a subagent at a given depth.
 *
 * depth 0: " "       (root-level: single space prefix)
 * depth 1: "   └─ "  (child: tree branch)
 * depth 2: "     └─ " (grandchild)
 */
function depthPrefix(depth: number): string {
  if (depth === 0) return " ";
  const indent = "  ".repeat(depth);
  return `${indent}└─ `;
}

/**
 * Sort records so that parent subagents appear before their children,
 * and within the same depth, preserve existing order.
 */
function sortByDepth(records: SubagentRecord[]): SubagentRecord[] {
  // Build a map of parentId → children
  const children = new Map<string, SubagentRecord[]>();
  const roots: SubagentRecord[] = [];

  for (const r of records) {
    const pid = r.status.parentId;
    if (pid) {
      const list = children.get(pid);
      if (list) {
        list.push(r);
      } else {
        children.set(pid, [r]);
      }
    } else {
      roots.push(r);
    }
  }

  // Flatten in depth-first order: root → child1 → child1.children → child2 → ...
  const result: SubagentRecord[] = [];
  function walk(list: SubagentRecord[]): void {
    for (const r of list) {
      result.push(r);
      const kids = children.get(r.status.id);
      if (kids) walk(kids);
    }
  }
  walk(roots);
  return result;
}

/**
 * Create a TUI widget component that renders all active subagent statuses.
 * The getter function is called on each render to fetch the latest records,
 * enabling efficient incremental updates via requestRender().
 * Returns a component compatible with `ctx.ui.setWidget()`.
 */
export function createSubagentWidget(
  getRecords: () => SubagentRecord[],
  theme: Theme,
): SubagentWidgetContent {
  return {
    render(width: number): string[] {
      const records = sortByDepth(getRecords());
      if (records.length === 0) return [];

      const lines: string[] = [];

      // Header separator
      const subagentsLabel = theme.fg(
        "muted",
        `── Subagents (${records.length}) `,
      );
      const fillLen = Math.max(0, width - visibleLen(subagentsLabel));
      lines.push(subagentsLabel + "─".repeat(fillLen));

      for (const record of records) {
        const s = record.status;
        const cfg = STATE_CONFIG[s.state] ?? STATE_CONFIG.running;
        const prefix = depthPrefix(s.depth);
        const icon = theme.fg(cfg.color, cfg.icon);
        const typeLabel = theme.fg("accent", `${s.type}:${s.id.slice(0, 6)}`);
        const stateLabel = theme.fg(cfg.color, cfg.label.padEnd(8));

        // Tokens
        const upStr = `↑${formatTokens(s.tokensInput)}`;
        const downStr = `↓${formatTokens(s.tokensOutput)}`;
        const tokens = theme.fg("dim", `${upStr}${downStr}`);

        // Duration
        const dur = theme.fg("dim", formatDuration(s.elapsedMs).padStart(6));

        // Output preview
        const outputPreview = s.outputPreview
          ? theme.fg("muted", truncateToFit(s.outputPreview, 50))
          : "";

        // Compose the line: prefix icon type:id  state  duration  tokens  preview
        const fullLine =
          `${prefix}${icon} ${typeLabel}  ${stateLabel} ${dur}  ${tokens}  ${outputPreview}`;
        lines.push(truncateToVisualWidth(fullLine, width));
      }

      return lines;
    },

    invalidate(): void {
      // Widget is re-rendered on each update via requestRender
    },
  };
}

// ---------------------------------------------------------------------------
// Utility: ANSI-aware truncation
// ---------------------------------------------------------------------------

/** Estimate visible character count, stripping ANSI sequences. */
function visibleLen(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToFit(text: string, maxLen: number): string {
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (stripped.length <= maxLen) return text;
  return stripped.slice(0, maxLen - 1) + "…";
}

function truncateToVisualWidth(line: string, width: number): string {
  if (visibleLen(line) <= width) return line;
  // Crude truncation — strip ANSI and cut to width
  // eslint-disable-next-line no-control-regex
  const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
  return stripped.slice(0, Math.max(0, width - 1)) + "…";
}
