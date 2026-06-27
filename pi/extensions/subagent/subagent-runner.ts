/**
 * subagent-runner.ts — Core subagent execution loop.
 *
 * Each subagent runs an independent LLM conversation with tool access
 * gated through the toolgate extension's public service API.
 *
 * Uses pi-ai's lazy API modules via dynamic import to stream LLM responses
 * without pulling in every provider at bundle time.
 */

import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  SimpleStreamOptions,
  TextContent,
  ToolCall,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { ProviderStreams } from "@earendil-works/pi-ai";
import type { ToolgateService } from "../toolgate/service";
import type { AskResult, SubagentConfig, SubagentStatus } from "./types";
import { createToolExecutor, type ToolExecutor, type ToolExecuteResult } from "./tool-executor";

// Import the compat module which statically pre-loads all API providers.
// jiti's dynamic import() does not honour package.json "exports" properly,
// but static imports work fine. The compat module exports streamSimple which
// routes to the correct API provider based on model.api.
import { streamSimple as compatStreamSimple } from "@earendil-works/pi-ai/compat";

// ---------------------------------------------------------------------------
// Helper: collect a full AssistantMessage from an event stream
// ---------------------------------------------------------------------------

async function collectAssistantMessage(
  stream: AsyncIterable<AssistantMessageEvent>,
  onTextDelta?: (delta: string) => void,
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  let message: AssistantMessage | undefined;

  for await (const event of stream) {
    if (signal?.aborted) {
      // Drain remaining events but don't process
      continue;
    }

    switch (event.type) {
      case "start":
        message = event.partial;
        break;
      case "text_delta":
        onTextDelta?.(event.delta);
        message = event.partial;
        break;
      case "text_end":
        message = event.partial;
        break;
      case "thinking_delta":
        // Thinking content — update partial but don't accumulate in output
        message = event.partial;
        break;
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        message = event.partial;
        break;
      case "done":
        return event.message;
      case "error":
        return event.error;
    }
  }

  if (message) return message;
  throw new Error("Stream ended without a message");
}

// ---------------------------------------------------------------------------
// Execute a single LLM call and return the assistant message
// ---------------------------------------------------------------------------

async function callLLM(
  streamSimple: ProviderStreams["streamSimple"],
  model: Model<any>,
  context: Context,
  signal?: AbortSignal,
  onTextDelta?: (delta: string) => void,
): Promise<AssistantMessage> {
  const options: SimpleStreamOptions = {
    signal,
    maxTokens: model.maxTokens,
  };

  // streamSimple returns AssistantMessageEventStream (may be wrapped in Promise)
  const result = streamSimple(model, context, options);
  const stream = result instanceof Promise ? await result : result;

  return collectAssistantMessage(stream, onTextDelta, signal);
}

// ---------------------------------------------------------------------------
// SubagentRunner
// ---------------------------------------------------------------------------

export interface SubagentRunnerOptions {
  config: SubagentConfig;
  task: string;
  model: Model<any>;
  cwd: string;
  toolgateService: ToolgateService;
  onUpdate: (status: SubagentStatus) => void;
  signal?: AbortSignal;
  /**
   * Callback invoked when a tool call requires user confirmation (ask state).
   * The main agent's index.ts injects this with showConfirmWithReason so the user
   * can approve or deny the operation (with an optional reason).
   * Returns AskResult with approved flag and optional reason.
   * When omitted (no UI available), ask is treated as deny.
   */
  onAsk?: (
    toolName: string,
    promptTitle: string,
    promptMessage: string,
  ) => Promise<AskResult>;
  /**
   * Nesting depth of this subagent (0 = root-level, 1 = sub-subagent, etc.).
   * Defaults to 0.
   */
  depth?: number;
  /**
   * Parent subagent ID. Undefined for root-level subagents.
   */
  parentId?: string;
  /**
   * Callback for executing recursive subagent tool calls (spawn_subagent,
   * query_subagent, kill_subagent). When omitted, subagent tools are not
   * available to this subagent.
   */
  onSubagentToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ToolExecuteResult>;
}

export async function runSubagent(
  options: SubagentRunnerOptions,
): Promise<SubagentStatus> {
  const {
    config,
    task,
    model,
    cwd,
    toolgateService,
    onUpdate,
    signal,
    onAsk,
    depth = 0,
    parentId,
    onSubagentToolCall,
  } = options;

  const startTime = Date.now();
  const executor = createToolExecutor(cwd, {
    allowedTools: config.tools,
    onSubagentToolCall,
  });

  // ── Build status object ──────────────────────────────────────────
  const status: SubagentStatus = {
    id: "", // filled by caller
    type: config.type,
    state: "running",
    output: "",
    outputPreview: "",
    tokensInput: 0,
    tokensOutput: 0,
    startTime,
    elapsedMs: 0,
    toolCallsCount: 0,
    depth,
    parentId,
  };

  function emitUpdate() {
    status.elapsedMs = Date.now() - startTime;
    status.outputPreview = truncatePreview(status.output);
    onUpdate({ ...status });
  }

  // ── Load the API module ──────────────────────────────────────────
  // compatStreamSimple handles API routing internally based on model.api.
  // No dynamic import needed — the compat module pre-loads at import time.
  const streamSimpleFn: ProviderStreams["streamSimple"] = (m, ctx, opts) =>
    compatStreamSimple(m, ctx, opts);

  // ── Build tool schemas ───────────────────────────────────────────
  const toolSchemas = executor.getAvailableTools().map((name) => {
    const def = executor.getToolDefinition(name);
    return {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    };
  });

  // ── Messages ─────────────────────────────────────────────────────
  const messages: Array<
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | AssistantMessage
    | ToolResultMessage
  > = [
    { role: "system", content: config.systemPrompt },
    { role: "user", content: task },
  ];

  // ── Main loop ────────────────────────────────────────────────────
  const maxTurns = 30;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (signal?.aborted) {
        status.state = "killed";
        emitUpdate();
        return status;
      }

      // Build LLM context (exclude the initial system message from messages)
      const llmMessages = messages.filter(
        (m) => m.role !== "system",
      ) as Context["messages"];

      const context: Context = {
        systemPrompt: config.systemPrompt,
        messages: llmMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      };

      // Call LLM
      let assistantMessage: AssistantMessage;
      try {
        assistantMessage = await callLLM(
          streamSimpleFn,
          model,
          context,
          signal,
          (delta) => {
            status.output += delta;
          },
        );
      } catch (err) {
        status.state = "error";
        status.errorMessage = `LLM call failed: ${(err as Error).message}`;
        emitUpdate();
        return status;
      }

      // Track tokens
      if (assistantMessage.usage) {
        status.tokensInput += assistantMessage.usage.input;
        status.tokensOutput += assistantMessage.usage.output;
      }

      if (signal?.aborted) {
        status.state = "killed";
        emitUpdate();
        return status;
      }

      // Extract tool calls
      const toolCalls: ToolCall[] = assistantMessage.content.filter(
        (c): c is ToolCall => c.type === "toolCall",
      );

      if (toolCalls.length === 0) {
        // No tool calls — done
        status.state =
          assistantMessage.stopReason === "error" ? "error" : "completed";
        if (assistantMessage.errorMessage) {
          status.errorMessage = assistantMessage.errorMessage;
        }
        emitUpdate();
        return status;
      }

      // Push assistant message to history
      messages.push(assistantMessage);

      // Execute each tool call
      for (const tc of toolCalls) {
        if (signal?.aborted) {
          status.state = "killed";
          emitUpdate();
          return status;
        }

        // Gate through toolgate
        const checkResult = toolgateService.check(
          tc.name,
          tc.arguments as Record<string, unknown>,
          config.permission,
          cwd,
        );

        if (checkResult.state === "deny") {
          messages.push({
            role: "toolResult",
            toolCallId: tc.id,
            toolName: tc.name,
            content: [
              {
                type: "text",
                text: `Blocked by permission policy: ${checkResult.reason ?? "denied"}`,
              },
            ],
            isError: true,
            timestamp: Date.now(),
          });
          status.toolCallsCount++;
          continue;
        }

        if (checkResult.state === "ask") {
          // Subagent has no UI — delegate confirmation to the main agent
          // via the onAsk callback injected from index.ts.
          let askResult: AskResult = { approved: false };
          if (onAsk) {
            try {
              // Use rich prompt info from toolgate's evaluate() if available,
              // falling back to a simple summary when details are missing.
              const title = checkResult.promptTitle ?? `Subagent: ${tc.name}`;
              const message = checkResult.promptMessage ??
                `Tool: ${tc.name}\n` +
                `Profile: ${config.permission}\n\n` +
                `${checkResult.reason ?? "Policy requires confirmation"}\n\n` +
                `Allow this operation?`;
              askResult = await onAsk(tc.name, title, message);
            } catch (_err) {
              askResult = { approved: false };
            }
          }

          if (!askResult.approved) {
            const denialText = askResult.reason
              ? `User denied with reason: ${askResult.reason}`
              : `Blocked by permission policy: ${checkResult.reason ?? "user denied or no UI available"}`;
            messages.push({
              role: "toolResult",
              toolCallId: tc.id,
              toolName: tc.name,
              content: [
                {
                  type: "text",
                  text: denialText,
                },
              ],
              isError: true,
              timestamp: Date.now(),
            });
            status.toolCallsCount++;
            continue;
          }
          // User approved — fall through to execute.
        }

        // Execute
        try {
          const result = await executor.execute(
            tc.name,
            tc.arguments as Record<string, unknown>,
            signal,
          );
          messages.push({
            role: "toolResult",
            toolCallId: tc.id,
            toolName: tc.name,
            content: result.content,
            isError: false,
            timestamp: Date.now(),
          });
        } catch (err) {
          messages.push({
            role: "toolResult",
            toolCallId: tc.id,
            toolName: tc.name,
            content: [
              {
                type: "text",
                text: `Execution error: ${(err as Error).message}`,
              },
            ],
            isError: true,
            timestamp: Date.now(),
          });
        }

        status.toolCallsCount++;
        emitUpdate();
      }
    }

    // Hit turn limit
    status.state = "completed";
    status.output +=
      "\n\n[Reached maximum turns — stopping.]";
    emitUpdate();
    return status;
  } catch (err) {
    status.state = "error";
    status.errorMessage = `Unexpected error: ${(err as Error).message}`;
    emitUpdate();
    return status;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncatePreview(text: string, maxLen = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return "…" + trimmed.slice(-maxLen);
}
