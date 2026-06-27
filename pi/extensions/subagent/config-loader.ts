/**
 * config-loader.ts — Loads subagent configurations from .md files
 * with YAML frontmatter.
 *
 * Config files live in extensions/subagent/config/ with format
 * `<subagent-type>.md`. Frontmatter fields:
 *
 *   name:        Display name (optional, defaults to type)
 *   description: Human-readable description
 *   tools:       Comma-separated allowed tool names
 *   permission:  Toolgate profile name (e.g. "subagent")
 *   subagents:   Comma-separated child subagent types
 *   model:       Model override (e.g. "deepseek-v4-flash")
 *   thinking:    Thinking level (e.g. "medium")
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { SubagentConfig, SubagentFrontmatter } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a frontmatter value that may be a comma-separated string or
 * already an array of strings. Returns the trimmed string array or undefined.
 */
function parseCsvField(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Load all subagent configs from a directory.
 * Returns a Map from type name to SubagentConfig.
 */
export function loadConfigs(configDir: string): Map<string, SubagentConfig> {
  const configs = new Map<string, SubagentConfig>();

  if (!existsSync(configDir)) {
    console.warn(`[subagent] Config directory not found: ${configDir}`);
    return configs;
  }

  let entries: string[];
  try {
    entries = readdirSync(configDir);
  } catch {
    console.warn(`[subagent] Cannot read config directory: ${configDir}`);
    return configs;
  }

  for (const entry of entries) {
    if (extname(entry) !== ".md") continue;

    const filePath = join(configDir, entry);
    const type = basename(entry, ".md");

    try {
      const raw = readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw) as {
        frontmatter: Record<string, unknown>;
        body: string;
      };

      // ── Parse frontmatter fields ──────────────────────────────

      // Permission: prefer `permission`, fall back to `tool`, default "subagent"
      const permission =
        typeof frontmatter.permission === "string"
          ? frontmatter.permission
          : typeof frontmatter.tool === "string"
            ? frontmatter.tool
            : "subagent";

      const name =
        typeof frontmatter.name === "string"
          ? frontmatter.name
          : undefined;

      const description =
        typeof frontmatter.description === "string"
          ? frontmatter.description
          : undefined;

      const tools = parseCsvField(frontmatter.tools);

      const subagents = parseCsvField(frontmatter.subagents);

      const model =
        typeof frontmatter.model === "string"
          ? frontmatter.model
          : undefined;

      const thinking =
        typeof frontmatter.thinking === "string"
          ? frontmatter.thinking
          : undefined;

      // ── Build frontmatter object (kept for consumers) ─────────
      const fm: SubagentFrontmatter = {
        name,
        description,
        permission,
        tools,
        subagents,
        model,
        thinking,
        // Keep legacy field for backward compat
        tool: permission,
      };

      configs.set(type, {
        type,
        name,
        description,
        frontmatter: fm,
        systemPrompt: body.trim(),
        permission,
        tools,
        subagents,
        model,
        thinking,
      });
    } catch (err) {
      console.warn(
        `[subagent] Failed to parse config ${filePath}: ${(err as Error).message}`,
      );
    }
  }

  return configs;
}

/**
 * Ensure the config directory exists.
 *
 * In the current setup, config files (worker.md, scout.md, researcher.md)
 * ship with the extension. This function only creates the directory if
 * it doesn't exist yet (e.g. fresh install before files are copied).
 */
export function ensureDefaultConfig(configDir: string): void {
  if (existsSync(configDir)) return;

  try {
    mkdirSync(configDir, { recursive: true });
    console.log(`[subagent] Created config directory: ${configDir}`);
  } catch (err) {
    console.warn(
      `[subagent] Could not create config directory: ${(err as Error).message}`,
    );
  }
}
