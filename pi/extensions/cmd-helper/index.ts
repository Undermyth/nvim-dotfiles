/**
 * cmd-helper — Shell Command Generator Extension
 *
 * Registers `--bash` CLI flag. When active, pi becomes a shell command
 * generator: the LLM outputs a single clean bash/powershell command from a
 * natural-language description — zero tool calls, zero thinking overhead.
 *
 * Usage:
 *   pi -p "查询当前发行版" --bash
 *   pi -p --bash=true "list files"
 *   echo "显示内存使用" | pi -p --bash
 *
 * Config: extensions/cmd-helper/cmd-helper.json (same directory as this file)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Configuration types & defaults
// ---------------------------------------------------------------------------

interface CmdHelperConfig {
  /** Switch model for speed/cost.  Omit to keep current model. */
  model?: { provider: string; name: string };
  /** When false, thinking is forced off for fastest response. */
  thinking: boolean;
  /** When true, all tools are disabled — LLM responds directly, no roundtrip. */
  disableTools: boolean;
  /** Custom system prompt.  null = use built-in default (recommended). */
  systemPrompt: string | null;
  /** Platform → shell name mapping. */
  shells: Record<string, string>;
}

const DEFAULTS: CmdHelperConfig = {
  thinking: false,
  disableTools: true,
  systemPrompt: null,
  shells: { linux: "bash", darwin: "zsh", win32: "powershell" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig(): CmdHelperConfig {
  const p = join(getAgentDir(), "extensions", "cmd-helper", "cmd-helper.json");
  if (!existsSync(p)) return DEFAULTS;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return { ...DEFAULTS, ...parsed, shells: { ...DEFAULTS.shells, ...(parsed.shells ?? {}) } };
  } catch (err) {
    console.error("[cmd-helper] Failed to parse config:", err);
    return DEFAULTS;
  }
}

function detectShell(cfg: CmdHelperConfig): string {
  return cfg.shells[process.platform] ?? "bash";
}

function buildDefaultSystemPrompt(shell: string): string {
  return [
    `You are a ${shell} command generator. Convert the user's description into ONE clean ${shell} command.`,
    "",
    "CRITICAL RULES — follow them exactly:",
    "1. Output ONLY the raw command — no markdown code fences, no backticks, no explanations.",
    "2. The output must be directly copy-pasteable into a terminal and immediately runnable.",
    `3. Use ${shell} syntax conventions and best practices.`,
    "4. Keep the command simple, correct, and safe.",
    "5. If the request is ambiguous, pick the most common interpretation.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

let _config: CmdHelperConfig | undefined;

export default function cmdHelper(pi: ExtensionAPI) {
  pi.registerFlag("bash", {
    description:
      "Generate a shell command from a natural-language description. " +
      'Usage: pi -p "description" --bash',
    type: "boolean",
    default: false,
  });

  // ── session_start: apply speed optimizations ──────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (!pi.getFlag("bash")) return;

    const config = (_config ??= loadConfig());

    // Switch to fast/cheap model
    if (config.model) {
      const model = ctx.modelRegistry.find(config.model.provider, config.model.name);
      if (model) {
        const ok = await pi.setModel(model);
        if (!ok && ctx.hasUI) {
          ctx.ui.notify(
            `[cmd-helper] No API key for ${config.model.provider}/${config.model.name}`,
            "warning",
          );
        }
      } else if (ctx.hasUI) {
        ctx.ui.notify(
          `[cmd-helper] Model ${config.model.provider}/${config.model.name} not found`,
          "warning",
        );
      }
    }

    // Thinking off
    if (!config.thinking) pi.setThinkingLevel("off");

    // Disable all tools — no tool-call roundtrip
    if (config.disableTools) pi.setActiveTools([]);

    if (ctx.hasUI) {
      const shell = detectShell(config);
      ctx.ui.notify(`[cmd-helper] Active — will output ${shell} command`, "info");
    }
  });

  // ── before_agent_start: inject system prompt ──────────────────────────
  pi.on("before_agent_start", async (event) => {
    if (!pi.getFlag("bash")) return;

    const config = (_config ??= loadConfig());
    const shell = detectShell(config);

    const prompt =
      typeof config.systemPrompt === "string" && config.systemPrompt.trim().length > 0
        ? config.systemPrompt
        : buildDefaultSystemPrompt(shell);

    return { systemPrompt: prompt };
  });

  // ── message_end: trim trailing whitespace from assistant output ───────
  pi.on("message_end", async (event) => {
    if (!pi.getFlag("bash")) return;
    if (event.message.role !== "assistant") return;

    const content = event.message.content;
    if (!Array.isArray(content)) return;

    // Trim trailing whitespace / blank lines from every text block.
    // This prevents print mode (-p --bash) from outputting dozens of empty lines
    // after the generated command.
    const trimmed = content.map((block) => {
      if (block.type === "text" && typeof block.text === "string") {
        const cleaned = block.text
          .replace(/[\t ]+\n/g, "\n") // strip trailing spaces on each line
          .replace(/\n{2,}$/g, "\n")  // collapse multiple trailing blank lines to one
          .trimEnd();                   // remove final trailing whitespace
        return { ...block, text: cleaned };
      }
      return block;
    });

    return { message: { ...event.message, content: trimmed } };
  });
}
