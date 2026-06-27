/**
 * tool-executor.ts — Creates and executes tools for subagents.
 *
 * Uses pi's built-in tool factory functions for file/bash/search tools,
 * websearch utils for SearXNG tools, and a callback for subagent-specific
 * tools (spawn/query/kill).
 *
 * Tools are filtered by the subagent config's `tools` field so each
 * subagent type sees only its allowed tool set.
 */

import type { TSchema } from "typebox";
import { Type } from "typebox";

import {
  createBashTool,
  createReadTool,
  createWriteTool,
  createEditTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from "@earendil-works/pi-coding-agent";
import type {
  ImageContent,
  TextContent,
} from "@earendil-works/pi-ai";

import { platform } from "node:os";
import { callMcpTool, loadConfig } from "../websearch/utils.ts";

// ── Resolve extensions directory (for websearch config loading) ───
const EXTENSIONS_DIR = (() => {
  try {
    let dir = new URL(".", import.meta.url).pathname;
    // On Windows, URL.pathname produces /C:/foo — strip the leading slash.
    if (platform() === "win32" && /^\/[a-zA-Z]:\//.test(dir)) {
      dir = dir.slice(1);
    }
    // dir = .../extensions/subagent/ → strip /subagent/ to get .../extensions/
    return dir.replace(/\/subagent\/$/, "");
  } catch {
    return "";
  }
})();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: TSchema;
}

export interface ToolExecuteResult {
  content: (TextContent | ImageContent)[];
}

export interface ToolExecutor {
  getAvailableTools(): string[];
  getToolDefinition(name: string): ToolDefinition;
  execute(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolExecuteResult>;
}

export interface ToolExecutorOptions {
  /**
   * If provided, only tools whose names appear in this array are available.
   * When undefined, all registered tools are available.
   */
  allowedTools?: string[];
  /**
   * Callback for executing subagent-specific tools (spawn_subagent,
   * query_subagent, kill_subagent). When not provided, these tools
   * are not registered (subagent cannot recursively spawn).
   */
  onSubagentToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ToolExecuteResult>;
}

// ---------------------------------------------------------------------------
// Tool name constants
// ---------------------------------------------------------------------------

/** Built-in file/bash tools. */
const BUILTIN_TOOLS = ["read", "write", "edit", "bash", "ls"] as const;

/** Fuzzy search tools (created from createFindTool/createGrepTool). */
const SEARCH_TOOLS = ["fffind", "ffgrep"] as const;

/** Web search / MCP tools (powered by SearXNG). */
const WEB_TOOLS = [
  "searxng_web_search",
  "searxng_search_suggestions",
  "searxng_instance_info",
  "web_url_read",
] as const;

/** Subagent lifecycle tools (recursive spawning). */
const SUBAGENT_TOOLS = [
  "spawn_subagent",
  "query_subagent",
  "kill_subagent",
] as const;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createToolExecutor(
  cwd: string,
  options?: ToolExecutorOptions,
): ToolExecutor {
  const { allowedTools, onSubagentToolCall } = options ?? {};

  // ── Build tool instance map ──────────────────────────────────────
  const toolInstances = new Map<string, any>();

  // Built-in tools via pi-coding-agent factories
  if (!allowedTools || allowedTools.some((t) => (BUILTIN_TOOLS as readonly string[]).includes(t))) {
    toolInstances.set("read", createReadTool(cwd));
    toolInstances.set("write", createWriteTool(cwd));
    toolInstances.set("edit", createEditTool(cwd));
    toolInstances.set("bash", createBashTool(cwd));
    toolInstances.set("ls", createLsTool(cwd));
  }

  // Fuzzy search tools (fffind / ffgrep)
  if (!allowedTools || allowedTools.includes("fffind")) {
    toolInstances.set("fffind", createFindTool(cwd));
  }
  if (!allowedTools || allowedTools.includes("ffgrep")) {
    toolInstances.set("ffgrep", createGrepTool(cwd));
  }

  // ── Build tool definition map ────────────────────────────────────
  const definitions = new Map<string, ToolDefinition>();

  // Register definitions for all built-in tools
  for (const name of BUILTIN_TOOLS) {
    const tool = toolInstances.get(name);
    if (tool) {
      definitions.set(name, {
        name,
        description: tool.description ?? `Built-in tool: ${name}`,
        parameters: tool.parameters,
      });
    }
  }

  // Register definitions for search tools
  if (toolInstances.has("fffind")) {
    const t = toolInstances.get("fffind")!;
    definitions.set("fffind", {
      name: "fffind",
      description: t.description ?? "Fuzzy find files by path or glob",
      parameters: t.parameters,
    });
  }
  if (toolInstances.has("ffgrep")) {
    const t = toolInstances.get("ffgrep")!;
    definitions.set("ffgrep", {
      name: "ffgrep",
      description: t.description ?? "Grep file contents with fuzzy matching",
      parameters: t.parameters,
    });
  }

  // ── Web search tools ─────────────────────────────────────────────
  if (!allowedTools || WEB_TOOLS.some((t) => allowedTools.includes(t))) {
    registerWebTools(definitions, toolInstances);
  }

  // ── Subagent tools (recursive spawning) ──────────────────────────
  if (onSubagentToolCall && (!allowedTools || SUBAGENT_TOOLS.some((t) => allowedTools.includes(t)))) {
    registerSubagentTools(definitions, toolInstances, onSubagentToolCall);
  }

  // ── Compute available tool names ─────────────────────────────────
  // Intersect registered tools with allowedTools if provided.
  let availableTools = Array.from(definitions.keys());
  if (allowedTools) {
    availableTools = availableTools.filter((name) => allowedTools.includes(name));
  }

  return {
    getAvailableTools(): string[] {
      return availableTools;
    },

    getToolDefinition(name: string): ToolDefinition {
      const def = definitions.get(name);
      if (!def) throw new Error(`Unknown tool: ${name}`);
      return def;
    },

    async execute(
      name: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<ToolExecuteResult> {
      // Subagent tools go through the callback
      if (SUBAGENT_TOOLS.includes(name as any) && onSubagentToolCall) {
        return onSubagentToolCall(name, args, signal);
      }

      const tool = toolInstances.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Built-in / web search tools: call execute
      const result = await tool.execute(
        // Built-in tools use: execute(toolCallId, params, signal, onUpdate)
        // Web search tools use: execute(toolCallId, params, signal)
        // Normalize: always pass at least (toolCallId, args, signal)
        `subagent-${name}-${Date.now()}`,
        args,
        signal,
        undefined, // onUpdate — not needed for subagent tool execution
      );

      // Normalize result content
      const content = Array.isArray(result.content)
        ? result.content
        : [{ type: "text" as const, text: String(result.content ?? "") }];

      return { content };
    },
  };
}

// ---------------------------------------------------------------------------
// Web search tool registration
// ---------------------------------------------------------------------------

function registerWebTools(
  definitions: Map<string, ToolDefinition>,
  toolInstances: Map<string, any>,
): void {
  // Resolve the websearch config path relative to the extensions dir
  const webConfig = loadConfig(EXTENSIONS_DIR);

  // Helper: create a websearch tool instance that wraps callMcpTool
  function makeWebTool(toolName: string) {
    return {
      description: "",
      parameters: {},
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal?: AbortSignal,
      ): Promise<any> {
        const text = await callMcpTool(webConfig, toolName, params, signal);
        return { content: [{ type: "text", text }] };
      },
    };
  }

  // searxng_web_search
  {
    const tool = makeWebTool("searxng_web_search");
    tool.description =
      "Searches the web using SearXNG and returns a list of results, each with a title, URL, and content snippet. " +
      "CRITICAL: The required parameter name is exactly `query` (not `prompt`, `q`, or any other name). " +
      "Use `pageno` to paginate results; combine `time_range` and `language` to narrow scope. " +
      "To read the full text of a result URL, follow up with `web_url_read`.";
    tool.parameters = Type.Object({
      query: Type.String({ description: "The search query string." }),
      pageno: Type.Optional(Type.Number({ description: "Search page number (starts at 1)", default: 1 })),
      time_range: Type.Optional(
        Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("year")]),
      ),
      language: Type.Optional(
        Type.String({ description: "Language code for search results (e.g. 'en', 'fr', 'de')", default: "all" }),
      ),
      safesearch: Type.Optional(
        Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)], {
          description: "Safe search filter level (0: None, 1: Moderate, 2: Strict)",
        }),
      ),
      min_score: Type.Optional(
        Type.Number({ description: "Minimum relevance score threshold from 0.0 to 1.0.", minimum: 0, maximum: 1 }),
      ),
      num_results: Type.Optional(
        Type.Number({ description: "Maximum number of results to return (1-20)", minimum: 1, maximum: 20 }),
      ),
      categories: Type.Optional(
        Type.String({ description: "Comma-separated SearXNG categories." }),
      ),
      engines: Type.Optional(
        Type.String({ description: "Comma-separated SearXNG engine names." }),
      ),
      response_format: Type.Optional(
        Type.Union([Type.Literal("text"), Type.Literal("json")]),
      ),
    });
    toolInstances.set("searxng_web_search", tool);
    definitions.set("searxng_web_search", {
      name: "searxng_web_search",
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  // searxng_search_suggestions
  {
    const tool = makeWebTool("searxng_search_suggestions");
    tool.description =
      "Returns autocomplete suggestions from the configured SearXNG instance. " +
      "Use this to refine vague or partial queries before searching.";
    tool.parameters = Type.Object({
      query: Type.String({ description: "Partial or complete query to autocomplete." }),
      language: Type.Optional(
        Type.String({ description: "Language code for suggestions (e.g. 'en', 'fr', 'de') or 'all'.", default: "all" }),
      ),
    });
    toolInstances.set("searxng_search_suggestions", tool);
    definitions.set("searxng_search_suggestions", {
      name: "searxng_search_suggestions",
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  // searxng_instance_info
  {
    const tool = makeWebTool("searxng_instance_info");
    tool.description =
      "Discovers capabilities from the configured SearXNG instance via /config, " +
      "including categories, engines, defaults, locales, and plugins.";
    tool.parameters = Type.Object({
      includeEngines: Type.Optional(
        Type.Boolean({ description: "Include enabled engine names in the response.", default: false }),
      ),
      includeDisabled: Type.Optional(
        Type.Boolean({ description: "Include disabled engine names when includeEngines is true.", default: false }),
      ),
      category: Type.Optional(
        Type.String({ description: "Filter categories and engines to a single category name." }),
      ),
      refresh: Type.Optional(
        Type.Boolean({ description: "Bypass the process cache and fetch fresh /config data.", default: false }),
      ),
    });
    toolInstances.set("searxng_instance_info", tool);
    definitions.set("searxng_instance_info", {
      name: "searxng_instance_info",
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  // web_url_read
  {
    const tool = makeWebTool("web_url_read");
    tool.description =
      "Fetches a URL and returns its text content converted to markdown. " +
      "Three modes: (1) Full content — omit filtering params. (2) Section extraction — " +
      "set `section` to return content under a specific heading. (3) Headings only — " +
      "set `readHeadings: true` to list all headings. Use after `searxng_web_search` " +
      "to read the full content of individual result URLs.";
    tool.parameters = Type.Object({
      url: Type.String({ description: "URL" }),
      startChar: Type.Optional(
        Type.Number({ description: "Starting character position for content extraction", minimum: 0 }),
      ),
      maxLength: Type.Optional(
        Type.Number({ description: "Maximum number of characters to return", minimum: 1 }),
      ),
      section: Type.Optional(
        Type.String({ description: "Extract content under a specific heading (searches for heading text)" }),
      ),
      paragraphRange: Type.Optional(
        Type.String({ description: "Return specific paragraph ranges (e.g., '1-5', '3', '10-')" }),
      ),
      readHeadings: Type.Optional(
        Type.Boolean({ description: "Return only a list of headings instead of full content" }),
      ),
    });
    toolInstances.set("web_url_read", tool);
    definitions.set("web_url_read", {
      name: "web_url_read",
      description: tool.description,
      parameters: tool.parameters,
    });
  }
}

// ---------------------------------------------------------------------------
// Subagent tool registration (recursive spawning)
// ---------------------------------------------------------------------------

function registerSubagentTools(
  definitions: Map<string, ToolDefinition>,
  toolInstances: Map<string, any>,
  onCall: NonNullable<ToolExecutorOptions["onSubagentToolCall"]>,
): void {
  // spawn_subagent
  {
    const desc = "Spawn a background sub-agent to work on a task independently.";
    const params = Type.Object({
      type: Type.String({ description: "Subagent type name (matches a config file name)." }),
      task: Type.String({ description: "The task/prompt for the subagent to complete." }),
    });
    definitions.set("spawn_subagent", { name: "spawn_subagent", description: desc, parameters: params });
    toolInstances.set("spawn_subagent", {
      description: desc,
      parameters: params,
      execute: (_id: string, args: Record<string, unknown>, signal?: AbortSignal) =>
        onCall("spawn_subagent", args, signal),
    });
  }

  // query_subagent
  {
    const desc = "Query the status and output of sub-agents. Omit the ID or use 'all' to list all sub-agents.";
    const params = Type.Object({
      id: Type.Optional(Type.String({ description: "Subagent ID to query. Omit or use 'all' to list all sub-agents." })),
      wait: Type.Optional(Type.Boolean({
        description: "If true, block until the subagent completes before returning. Defaults to false.",
      })),
    });
    definitions.set("query_subagent", { name: "query_subagent", description: desc, parameters: params });
    toolInstances.set("query_subagent", {
      description: desc,
      parameters: params,
      execute: (_id: string, args: Record<string, unknown>, signal?: AbortSignal) =>
        onCall("query_subagent", args, signal),
    });
  }

  // kill_subagent
  {
    const desc = "Terminate a running sub-agent by its ID.";
    const params = Type.Object({
      id: Type.String({ description: "Subagent ID to terminate." }),
    });
    definitions.set("kill_subagent", { name: "kill_subagent", description: desc, parameters: params });
    toolInstances.set("kill_subagent", {
      description: desc,
      parameters: params,
      execute: (_id: string, args: Record<string, unknown>, signal?: AbortSignal) =>
        onCall("kill_subagent", args, signal),
    });
  }
}
