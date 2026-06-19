/**
 * token-detail — Companion extension for pi-powerline-footer
 *
 * Publishes per-session accumulated input / output / cache-read token counts
 * as extension statuses so that pi-powerline-footer customItems can promote
 * them into dedicated powerline segments.
 *
 * No modification of pi-powerline-footer source code is required.
 *
 * Configure powerline with e.g.:
 *   "powerline": {
 *     "preset": "default",
 *     "customItems": [
 *       { "id": "token-in",  "statusKey": "token-in",  "position": "right", "color": "muted" },
 *       { "id": "token-out", "statusKey": "token-out", "position": "right", "color": "muted" }
 *     ]
 *   }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── helpers ────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Narrow a session entry to an assistant message whose usage object has the
 * numeric fields we need.
 */
function hasSessionAssistantUsage(
  value: unknown,
): value is { usage: { input: number; output: number; cacheRead: number; cacheWrite: number } } {
  if (!isRecord(value)) return false;
  const u = value.usage;
  return (
    isRecord(u) &&
    typeof u.input === "number" &&
    typeof u.output === "number" &&
    typeof u.cacheRead === "number" &&
    typeof u.cacheWrite === "number"
  );
}

function getUsageTokenTotal(u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const t = (u as Record<string, unknown>).totalTokens;
  if (typeof t === "number") return t;
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

/**
 * Smart token formatting matching pi-powerline-footer.
 *   < 1000 → "512"
 *   < 10k  → "4.2k"
 *   < 1M   → "42k"
 *   < 10M  → "4.2M"
 *   >= 10M → "42M"
 */
function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

// ── state ──────────────────────────────────────────────────────────────────

let accInput = 0;
let accOutput = 0;
let accCacheRead = 0;

// ── scan + publish ─────────────────────────────────────────────────────────

function scanSessionMessages(ctx: any): void {
  accInput = 0;
  accOutput = 0;
  accCacheRead = 0;

  const events: unknown[] = ctx.sessionManager?.getBranch?.() ?? [];
  for (const e of events) {
    if (!isRecord(e) || e.type !== "message") continue;
    const msg = e.message;
    if (!isRecord(msg) || msg.role !== "assistant") continue;
    if (!hasSessionAssistantUsage(msg)) continue;

    // Skip errored / aborted messages (same heuristic as powerline-footer)
    if (msg.stopReason === "error" || msg.stopReason === "aborted") continue;
    // Skip messages with zero total tokens (streaming fragments)
    if (getUsageTokenTotal(msg.usage) === 0) continue;

    accInput += msg.usage.input;
    accOutput += msg.usage.output;
    accCacheRead += msg.usage.cacheRead;
  }

  publishStatuses(ctx);
}

function publishStatuses(ctx: any): void {
  if (!ctx?.hasUI) return;

  ctx.ui.setStatus(
    "token-in",
    accInput > 0 ? `↑${formatTokens(accInput)}` : undefined,
  );
  ctx.ui.setStatus(
    "token-out",
    accOutput > 0 ? `↓${formatTokens(accOutput)}` : undefined,
  );
}

// ── extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    scanSessionMessages(ctx);
  });

  // Rebuild after tree navigation (messages may differ from active branch)
  pi.on("session_tree", async (_event, ctx) => {
    scanSessionMessages(ctx);
  });

  // Rebuild after compaction (older messages replaced by summary)
  pi.on("session_compact", async (_event, ctx) => {
    scanSessionMessages(ctx);
  });

  // Accumulate live usage token-by-message so the footer updates during a turn
  pi.on("message_end", async (event, ctx) => {
    const msg = event.message;
    if (!isRecord(msg) || msg.role !== "assistant") return;
    if (!hasSessionAssistantUsage(msg)) return;
    if (msg.stopReason === "error" || msg.stopReason === "aborted") return;
    if (getUsageTokenTotal(msg.usage) === 0) return;

    accInput += msg.usage.input;
    accOutput += msg.usage.output;
    accCacheRead += msg.usage.cacheRead;

    publishStatuses(ctx);
  });
}
