/**
 * subagent — Background sub-agent extension for Pi.
 *
 * Allows the main agent to spawn independent sub-agents that run LLM
 * conversations with tool access gated through the toolgate extension.
 *
 * Supports recursive subagent spawning: a worker subagent can spawn
 * scout and researcher children. Depth is limited by configuration
 * (scout and researcher have no `subagents` field, so max depth is 2).
 *
 * Tools registered:
 *   spawn_subagent  — Create and start a sub-agent
 *   query_subagent  — Query sub-agent status
 *   kill_subagent   — Terminate a running sub-agent
 *
 * Config: extensions/subagent/config/<type>.md
 * Toolgate profile: mapped via `permission` field in frontmatter
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import type { Model } from "@earendil-works/pi-ai";
// getModel from compat resolves a (provider, modelId) pair to a Model object
import { getModel } from "@earendil-works/pi-ai/compat";

import { loadConfigs, ensureDefaultConfig } from "./config-loader";
import { runSubagent } from "./subagent-runner";
import { createSubagentWidget } from "./renderer";
import type { AskResult, SubagentConfig, SubagentRecord, SubagentStatus } from "./types";
import type { ToolgateService } from "../toolgate/service";
import type { ToolExecuteResult } from "./tool-executor";
import { getConfirmQueue } from "../toolgate/service";
import { showConfirmWithReason } from "../toolgate/confirm-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTENSION_DIR = (() => {
  try {
    return resolve(dirname(fileURLToPath(import.meta.url)));
  } catch {
    return resolve(homedir(), ".pi", "agent", "extensions", "subagent");
  }
})();

const CONFIG_DIR = resolve(EXTENSION_DIR, "config");

const TOOLGATE_SERVICE_KEY = Symbol.for("@toolgate:service");

// ---------------------------------------------------------------------------
// UUID generation (short)
// ---------------------------------------------------------------------------

function shortId(): string {
  return randomUUID().slice(0, 8);
}

// ---------------------------------------------------------------------------
// Toolgate service access
// ---------------------------------------------------------------------------

function getToolgateService(): ToolgateService | undefined {
  try {
    return (globalThis as Record<symbol, unknown>)[
      TOOLGATE_SERVICE_KEY
    ] as ToolgateService | undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a model string from subagent config to a Model object.
 *
 * Model string format (from config frontmatter `model` field):
 *   - "provider/modelId"  → split at "/", call getModel(provider, modelId)
 *   - "modelId"           → use defaultProvider + modelId
 *
 * Falls back to `ctx.model` if resolution fails.
 */
function resolveModel(
  modelStr: string | undefined,
  ctx: ExtensionContext,
): Model<any> {
  if (!modelStr) {
    if (!ctx.model) throw new Error("No model available for subagent");
    return ctx.model;
  }

  try {
    const slashIdx = modelStr.indexOf("/");
    let provider: string;
    let modelId: string;

    if (slashIdx >= 0) {
      provider = modelStr.slice(0, slashIdx);
      modelId = modelStr.slice(slashIdx + 1);
    } else {
      // Use the parent model's provider as fallback, or "deepseek" as last resort
      provider = (ctx.model as any)?.provider ?? (ctx as any).defaultProvider ?? "deepseek";
      modelId = modelStr;
    }

    const model = getModel(provider as any, modelId as any);
    if (model) return model;
  } catch {
    // getModel may throw if the model isn't in the static catalog
  }

  // Fallback to the parent agent's model
  if (ctx.model) return ctx.model;
  throw new Error(`Cannot resolve model: "${modelStr}" and no fallback available`);
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function subagentExtension(pi: ExtensionAPI): void {
  // ── State ──────────────────────────────────────────────────────────
  const records = new Map<string, SubagentRecord>();
  let configs = new Map<string, SubagentConfig>();

  // ── Widget state ────────────────────────────────────────────────
  let widgetRegistered = false;
  let tuiRef: any = undefined;
  let widgetVisibleRecords: SubagentRecord[] = [];
  let widgetInterval: ReturnType<typeof setInterval> | undefined;

  function updateWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI && ctx.mode !== "tui") return;

    const active = Array.from(records.values()).filter(
      (r) => r.status.state === "running",
    );
    const now = Date.now();
    const recentCompleted = Array.from(records.values()).filter(
      (r) =>
        r.status.state !== "running" &&
        now - r.status.startTime - r.status.elapsedMs < 30_000,
    );
    widgetVisibleRecords = [...active, ...recentCompleted];

    if (widgetVisibleRecords.length === 0) {
      ctx.ui.setWidget("subagents", undefined);
      widgetRegistered = false;
      tuiRef = undefined;
      if (widgetInterval) {
        clearInterval(widgetInterval);
        widgetInterval = undefined;
      }
      return;
    }

    // Start refresh timer when subagents are running (for live duration + spinner)
    if (active.length > 0 && !widgetInterval) {
      widgetInterval = setInterval(() => {
        tuiRef?.requestRender();
      }, 80);
    } else if (active.length === 0 && widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = undefined;
    }

    if (!widgetRegistered) {
      ctx.ui.setWidget(
        "subagents",
        (tui, theme) => {
          tuiRef = tui;
          return createSubagentWidget(() => widgetVisibleRecords, theme);
        },
        { placement: "aboveEditor" },
      );
      widgetRegistered = true;
    } else {
      tuiRef?.requestRender();
    }
  }

  // ── Session start: load configs, ensure defaults ──────────────────
  pi.on("session_start", (_event, ctx) => {
    ensureDefaultConfig(CONFIG_DIR);
    configs = loadConfigs(CONFIG_DIR);

    if (configs.size === 0) {
      console.warn("[subagent] No subagent configs loaded");
    } else {
      console.log(
        `[subagent] Loaded ${configs.size} subagent config(s): ${Array.from(configs.keys()).join(", ")}`,
      );
    }

    // Clear any stale records from previous sessions
    records.clear();
    widgetRegistered = false;
    tuiRef = undefined;
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = undefined;
    }
    updateWidget(ctx);
  });

  // ── Session shutdown: abort all running subagents ─────────────────
  pi.on("session_shutdown", () => {
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = undefined;
    }
    for (const record of records.values()) {
      try {
        record.abortController.abort();
      } catch {
        // Ignore abort errors during shutdown
      }
    }
    records.clear();
    widgetRegistered = false;
    tuiRef = undefined;
  });

  // ═══════════════════════════════════════════════════════════════════
  // Internal handler: spawn a subagent (called from both the main
  // agent's tool handler AND recursive onSubagentToolCall callbacks)
  // ═══════════════════════════════════════════════════════════════════

  async function handleSpawnSubagent(
    type: string,
    task: string,
    parentRecord: SubagentRecord | null,
    ctx: ExtensionContext,
  ): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> {
    // Validate config
    const config = configs.get(type);
    if (!config) {
      const available = Array.from(configs.keys()).join(", ");
      throw new Error(
        `Unknown subagent type: "${type}". Available: ${available || "(none)"}`,
      );
    }

    // Validate recursive spawning permission
    if (parentRecord) {
      const parentConfig = configs.get(parentRecord.status.type);
      const allowedChildren = parentConfig?.subagents;
      if (!allowedChildren || allowedChildren.length === 0) {
        throw new Error(
          `Subagent type "${parentRecord.status.type}" cannot spawn child subagents.`,
        );
      }
      if (!allowedChildren.includes(type)) {
        throw new Error(
          `Subagent "${parentRecord.status.type}" can only spawn: ${allowedChildren.join(", ")}. ` +
          `"${type}" is not allowed.`,
        );
      }
    }

    // Resolve model
    const model = resolveModel(config.model, ctx);

    // Compute depth and parentId
    const depth = parentRecord ? parentRecord.status.depth + 1 : 0;
    const parentId = parentRecord ? parentRecord.status.id : undefined;

    // Create record
    const id = shortId();
    const abortController = new AbortController();

    const status: SubagentStatus = {
      id,
      type,
      state: "running",
      output: "",
      outputPreview: "",
      tokensInput: 0,
      tokensOutput: 0,
      startTime: Date.now(),
      elapsedMs: 0,
      toolCallsCount: 0,
      depth,
      parentId,
    };

    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const record: SubagentRecord = {
      status,
      abortController,
      done,
    };

    // Store record
    records.set(id, record);

    // Refresh widget
    updateWidget(ctx);

    // ── Build onSubagentToolCall for this subagent ─────────────────
    // Only provide it if this subagent config allows recursive spawning
    const onSubagentToolCall = config.subagents && config.subagents.length > 0
      ? createSubagentToolHandler(record, ctx)
      : undefined;

    // ── Start subagent in background ────────────────────────────
    const toolgateService = getToolgateService();

    runSubagent({
      config,
      task,
      model,
      cwd: ctx.cwd,
      toolgateService: toolgateService ?? createFallbackGate(),
      onUpdate: (updatedStatus) => {
        record.status = updatedStatus;
        updateWidget(ctx);
      },
      signal: abortController.signal,
      depth,
      parentId,
      onSubagentToolCall,
      onAsk: async (_toolName, promptTitle, promptMessage): Promise<AskResult> => {
        if (!ctx.hasUI) {
          return { approved: false };
        }
        // Serialise through the confirm queue so that multiple concurrent
        // asks (e.g. from this subagent and the main agent's toolgate)
        // do not clobber each other's dialogs.
        let captured: AskResult = { approved: false };
        try {
          await getConfirmQueue().enqueue(async () => {
            try {
              captured = await showConfirmWithReason(ctx, promptTitle, promptMessage);
            } catch (_err) {
              captured = { approved: false };
            }
            return captured.approved;
          });
        } catch (_err) {
          captured = { approved: false };
        }
        return captured;
      },
    })
      .then((finalStatus) => {
        record.status = finalStatus;
        updateWidget(ctx);
        resolveDone();

        // Auto-cleanup completed records after 60 seconds
        setTimeout(() => {
          if (records.get(id) === record) {
            records.delete(id);
            updateWidget(ctx);
          }
        }, 60_000);
      })
      .catch((err) => {
        record.status.state = "error";
        record.status.errorMessage = `Subagent crashed: ${(err as Error).message}`;
        updateWidget(ctx);
        resolveDone();
      });

    return {
      content: [
        {
          type: "text",
          text:
            `Subagent spawned successfully.\n\n` +
            `ID: ${id}\n` +
            `Type: ${type}\n` +
            `State: running\n` +
            (depth > 0 ? `Depth: ${depth}\n` : "") +
            (parentId ? `Parent: ${parentId}\n` : "") +
            `\n` +
            `Use query_subagent with id="${id}" to check its status and retrieve results.`,
        },
      ],
      details: { subagentId: id, type, depth, parentId },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Create a subagent-tool handler closure for recursive spawning
  // ═══════════════════════════════════════════════════════════════════

  function createSubagentToolHandler(
    parentRecord: SubagentRecord,
    ctx: ExtensionContext,
  ): (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ToolExecuteResult> {
    return async (toolName, args, signal) => {
      switch (toolName) {
        case "spawn_subagent": {
          const result = await handleSpawnSubagent(
            args.type as string,
            args.task as string,
            parentRecord,
            ctx,
          );
          return { content: result.content };
        }

        case "query_subagent": {
          const id = args.id as string | undefined;
          const wait = args.wait as boolean | undefined;

          if (id && id !== "all") {
            const rec = records.get(id);
            if (!rec) {
              return {
                content: [{
                  type: "text",
                  text: `Subagent not found: "${id}". It may have been cleaned up.`,
                }],
              };
            }

            if (wait && rec.status.state === "running") {
              const TIMEOUT_MS = 5 * 60 * 1000;
              const timeoutPromise = new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error("Timed out waiting for subagent")), TIMEOUT_MS),
              );
              try {
                await Promise.race([rec.done, timeoutPromise]);
              } catch {
                // Timeout — return current state
              }
            }

            const s = rec.status;
            const output =
              s.state === "completed"
                ? s.output
                : s.state === "error"
                  ? `Error: ${s.errorMessage ?? "Unknown error"}\n\nPartial output:\n${s.output}`
                  : `[Still running...]\n\nPartial output:\n${s.output}`;

            return { content: [{ type: "text", text: output }] };
          }

          // List all
          if (records.size === 0) {
            return {
              content: [{ type: "text", text: "No sub-agents are currently active or recently completed." }],
            };
          }

          const list = Array.from(records.values()).map((r) => r.status);
          const text = list
            .map((s) => {
              const indent = "  ".repeat(s.depth);
              const stateIcon =
                s.state === "running" ? "⏳"
                : s.state === "completed" ? "✓"
                : s.state === "error" ? "✗"
                : "⊘";
              return (
                `${indent}${stateIcon} ${s.id} (${s.type}) — ${s.state} | ` +
                `↑${formatTokens(s.tokensInput)} ↓${formatTokens(s.tokensOutput)} | ` +
                `${formatDuration(s.elapsedMs)} | ${s.toolCallsCount} tool calls` +
                (s.errorMessage ? ` | Error: ${s.errorMessage}` : "") +
                (s.outputPreview ? `\n${indent}   Preview: "${s.outputPreview}"` : "") +
                (s.parentId ? `\n${indent}   ↓ child of ${s.parentId}` : "")
              );
            })
            .join("\n");

          return {
            content: [{
              type: "text",
              text: `${records.size} sub-agent(s):\n\n${text}\n\nUse query_subagent with a specific id to get full output.`,
            }],
          };
        }

        case "kill_subagent": {
          const id = args.id as string;
          const rec = records.get(id);

          if (!rec) {
            return {
              content: [{
                type: "text",
                text: `Subagent not found: "${id}". It may have already completed or been cleaned up.`,
              }],
            };
          }

          if (rec.status.state !== "running") {
            return {
              content: [{
                type: "text",
                text: `Subagent ${id} is not running (state: ${rec.status.state}). No action taken.`,
              }],
            };
          }

          rec.abortController.abort();
          rec.status.state = "killed";
          updateWidget(ctx);

          return {
            content: [{ type: "text", text: `Subagent ${id} has been terminated.` }],
          };
        }

        default:
          throw new Error(`Unknown subagent tool: ${toolName}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // TOOL: spawn_subagent
  // ═══════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "spawn_subagent",
    label: "Spawn Subagent",
    description:
      "Spawn a background sub-agent to work on a task independently. " +
      "The sub-agent has access to tools (read, write, edit, bash, etc.) " +
      "gated by its configured permission profile. Use query_subagent to " +
      "check its status and get results.",
    promptSnippet: "Spawn a sub-agent of the given type with a task",
    promptGuidelines: [
      "Use spawn_subagent to delegate independent subtasks to background workers. " +
      "Each sub-agent runs concurrently with read/write/edit/bash tools.",
      "Use query_subagent to poll for completion and retrieve results. Use wait: true to block until the subagent finishes.",
      "Use kill_subagent to terminate a sub-agent that is no longer needed.",
    ],
    parameters: Type.Object({
      type: Type.String({
        description:
          "Subagent type (matches a config file name, e.g. 'worker')",
      }),
      task: Type.String({
        description:
          "The task/prompt for the subagent to complete. Be specific about what you need.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { type, task } = params as { type: string; task: string };
      return handleSpawnSubagent(type, task, null, ctx);
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // TOOL: query_subagent
  // ═══════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "query_subagent",
    label: "Query Subagent",
    description:
      "Query the status and output of sub-agents. Omit the ID or use 'all' to list all sub-agents. " +
      "When querying a specific sub-agent, set wait: true to block until it completes.",
    promptSnippet: "Check status of sub-agents",
    promptGuidelines: [
      "Use query_subagent with wait: true to block until a subagent finishes, or omit wait for a non-blocking poll.",
    ],
    parameters: Type.Object({
      id: Type.Optional(
        Type.String({
          description:
            "Subagent ID to query. Omit or use 'all' to list all sub-agents.",
        }),
      ),
      wait: Type.Optional(
        Type.Boolean({
          description:
            "If true, block until the subagent completes before returning. " +
            "Only applies when querying a specific sub-agent by ID. Defaults to false.",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { id, wait } = params as { id?: string; wait?: boolean };

      if (id && id !== "all") {
        // Query single subagent
        const record = records.get(id);
        if (!record) {
          throw new Error(
            `Subagent not found: "${id}". It may have been cleaned up. Use query_subagent without an id to list all active sub-agents.`,
          );
        }

        // If wait is requested and the subagent is still running, block until done
        if (wait && record.status.state === "running") {
          const TIMEOUT_MS = 5 * 60 * 1000;
          const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("Timed out waiting for subagent")), TIMEOUT_MS),
          );

          try {
            await Promise.race([record.done, timeoutPromise]);
          } catch (err) {
            const s = record.status;
            const errMsg = (err as Error).message;
            return {
              content: [
                {
                  type: "text",
                  text:
                    `[Wait ${errMsg.includes("Timed out") ? "timed out" : "interrupted"}: ${errMsg}]\n\n` +
                    `State: ${s.state}\n` +
                    `Elapsed: ${formatDuration(s.elapsedMs)}\n` +
                    `\nPartial output:\n${s.output}`,
                },
              ],
              details: {
                id: s.id,
                type: s.type,
                state: s.state,
                depth: s.depth,
                parentId: s.parentId,
                tokensInput: s.tokensInput,
                tokensOutput: s.tokensOutput,
                elapsedMs: s.elapsedMs,
                toolCallsCount: s.toolCallsCount,
                errorMessage: s.errorMessage,
              },
            };
          }
        }

        updateWidget(ctx);

        const s = record.status;
        const output =
          s.state === "completed"
            ? s.output
            : s.state === "error"
              ? `Error: ${s.errorMessage ?? "Unknown error"}\n\nPartial output:\n${s.output}`
              : `[Still running...]\n\nPartial output:\n${s.output}`;

        return {
          content: [{ type: "text", text: output }],
          details: {
            id: s.id,
            type: s.type,
            state: s.state,
            depth: s.depth,
            parentId: s.parentId,
            tokensInput: s.tokensInput,
            tokensOutput: s.tokensOutput,
            elapsedMs: s.elapsedMs,
            toolCallsCount: s.toolCallsCount,
            errorMessage: s.errorMessage,
          },
        };
      }

      // List all subagents
      if (records.size === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No sub-agents are currently active or recently completed.",
            },
          ],
          details: { subagents: [] },
        };
      }

      const list = Array.from(records.values()).map((r) => {
        const s = r.status;
        return {
          id: s.id,
          type: s.type,
          state: s.state,
          depth: s.depth,
          parentId: s.parentId,
          tokensInput: s.tokensInput,
          tokensOutput: s.tokensOutput,
          elapsedMs: s.elapsedMs,
          toolCallsCount: s.toolCallsCount,
          outputPreview: s.outputPreview,
          errorMessage: s.errorMessage,
        };
      });

      const text = list
        .map((s) => {
          const indent = "  ".repeat(s.depth);
          const stateIcon =
            s.state === "running"
              ? "⏳"
              : s.state === "completed"
                ? "✓"
                : s.state === "error"
                  ? "✗"
                  : "⊘";
          return (
            `${indent}${stateIcon} ${s.id} (${s.type}) — ${s.state} | ` +
            `↑${formatTokens(s.tokensInput)} ↓${formatTokens(s.tokensOutput)} | ` +
            `${formatDuration(s.elapsedMs)} | ${s.toolCallsCount} tool calls` +
            (s.errorMessage ? ` | Error: ${s.errorMessage}` : "") +
            (s.outputPreview ? `\n${indent}   Preview: "${s.outputPreview}"` : "") +
            (s.parentId ? `\n${indent}   ↓ child of ${s.parentId}` : "")
          );
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              `${records.size} sub-agent(s):\n\n${text}\n\nUse query_subagent with a specific id to get full output.`,
          },
        ],
        details: { subagents: list },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // TOOL: kill_subagent
  // ═══════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "kill_subagent",
    label: "Kill Subagent",
    description: "Terminate a running sub-agent by its ID.",
    promptSnippet: "Kill a running sub-agent",
    parameters: Type.Object({
      id: Type.String({
        description: "Subagent ID to terminate.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { id } = params as { id: string };
      const record = records.get(id);

      if (!record) {
        throw new Error(
          `Subagent not found: "${id}". It may have already completed or been cleaned up.`,
        );
      }

      if (record.status.state !== "running") {
        return {
          content: [
            {
              type: "text",
              text:
                `Subagent ${id} is not running (state: ${record.status.state}). No action taken.`,
            },
          ],
          details: { id, state: record.status.state },
        };
      }

      record.abortController.abort();
      record.status.state = "killed";
      updateWidget(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Subagent ${id} has been terminated.`,
          },
        ],
        details: { id, state: "killed" },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Fallback toolgate (when toolgate extension is not loaded)
// ---------------------------------------------------------------------------

function createFallbackGate(): ToolgateService {
  return {
    check() {
      return { state: "allow" };
    },
    getToolState() {
      return "allow";
    },
    reload() {},
    hasProfile() {
      return true;
    },
    listProfiles() {
      return ["default"];
    },
  };
}

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
