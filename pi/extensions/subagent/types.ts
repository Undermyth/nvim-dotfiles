/**
 * types.ts — Shared type definitions for the subagent extension.
 */

/** Result of an ask confirmation (from user or timeout). */
export interface AskResult {
    approved: boolean;
    /** User-provided reason when denied with reason. */
    reason?: string;
}

/** YAML frontmatter parsed from subagent config .md files. */
export interface SubagentFrontmatter {
  /** Display name (e.g. "worker", "scout"). */
  name?: string;
  /** Human-readable description. */
  description?: string;
  /**
   * Toolgate permission profile name (e.g. "subagent", "default").
   * Replaces the legacy `tool` field. Falls back to `tool` for backward compat.
   */
  permission?: string;
  /**
   * @deprecated Use `permission` instead. Kept for backward compatibility.
   */
  tool?: string;
  /**
   * Allowed tool names for this subagent (comma-separated in YAML,
   * parsed to string[]). Tools not in this list are never presented
   * to the LLM. Tools that ARE in the list still go through toolgate.
   * When absent/empty, all available tools are allowed.
   */
  tools?: string[];
  /**
   * Subagent types this agent is allowed to recursively spawn
   * (comma-separated in YAML, parsed to string[]).
   * When absent/empty, this subagent cannot spawn child subagents.
   */
  subagents?: string[];
  /**
   * Model identifier override (e.g. "deepseek/deepseek-v4-flash").
   * When absent, the parent agent's model is inherited.
   */
  model?: string;
  /**
   * Thinking level for this subagent (e.g. "low", "medium", "high").
   * When absent, the system default is used.
   */
  thinking?: string;
}

/** Full subagent config loaded from a .md file. */
export interface SubagentConfig {
  /** Subagent type name (filename without .md extension). */
  type: string;
  /** Display name (from frontmatter or derived from type). */
  name?: string;
  /** Human-readable description. */
  description?: string;
  /** Parsed frontmatter (raw, for consumers that need it). */
  frontmatter: SubagentFrontmatter;
  /** Body content — used as the subagent's system prompt. */
  systemPrompt: string;
  /** Resolved toolgate permission profile name. */
  permission: string;
  /** Allowed tool names. undefined = all tools allowed. */
  tools?: string[];
  /** Allowed child subagent types. undefined = no recursive spawning. */
  subagents?: string[];
  /** Model identifier override. */
  model?: string;
  /** Thinking level. */
  thinking?: string;
}

/** Runtime state of a subagent. */
export type SubagentState = "running" | "completed" | "error" | "killed";

/** Public-facing status information exposed to the main agent. */
export interface SubagentStatus {
  /** Unique subagent identifier. */
  id: string;
  /** Subagent type name. */
  type: string;
  /** Current runtime state. */
  state: SubagentState;
  /** Full accumulated non-thinking output (text only, untruncated). */
  output: string;
  /** Truncated output preview for TUI display (~120 chars). */
  outputPreview: string;
  /** Total input tokens consumed. */
  tokensInput: number;
  /** Total output tokens consumed. */
  tokensOutput: number;
  /** Timestamp when the subagent started (ms since epoch). */
  startTime: number;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
  /** Number of tool calls executed. */
  toolCallsCount: number;
  /** Error message when state is "error". */
  errorMessage?: string;
  /** Nesting depth (0 = root-level subagent, 1 = sub-subagent, etc.). */
  depth: number;
  /** Parent subagent ID (undefined for root-level). */
  parentId?: string;
}

/** Internal record tracking a running or completed subagent. */
export interface SubagentRecord {
  status: SubagentStatus;
  /** Abort controller to cancel LLM calls. */
  abortController: AbortController;
  /** Resolves when the subagent finishes (success or error). */
  done: Promise<void>;
}
