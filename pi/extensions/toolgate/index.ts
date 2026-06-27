/**
 * toolgate — A simplified tool permission gate for the Pi coding agent.
 *
 * This extension intercepts every tool_call event and checks it against
 * profile-based permission rules defined in config.json. Each tool is
 * classified as allow / ask / deny. The "ask" state triggers a user
 * confirmation prompt.
 *
 * When running inside a subagent child process (PI_TOOLGATE_PROFILE env
 * is set), "ask" decisions are relayed back to the parent process via
 * stdout/stdin IPC — the parent shows the confirmation dialog in the
 * real TUI and writes the answer back.
 *
 * Features:
 * - Multi-profile config with fallback to "default"
 * - Bash command-pattern filtering (with wildcard * matching)
 * - Path heuristic: accessing files outside CWD upgrades allow → ask
 * - Public service API for subagent and other extensions
 * - Subagent ask-relay for nested subagent chains
 *
 * Config: ~/.pi/agent/extensions/toolgate/config.json
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { evaluate, type GateResult } from "./gate";
import {
	publishService,
	unpublishService,
	getConfirmQueue,
	type ToolgateService,
} from "./service";
import {
	isSubagentContext,
	relayAskToParent,
	setupAskStdinReader,
	publishAskRelayBridge,
} from "./ask-relay";
import { showConfirmWithReason } from "./confirm-dialog";

// ── YOLO mode: when enabled, all non-bash tools are auto-allowed ────
let yoloMode = false;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export default function toolgateExtension(pi: ExtensionAPI): void {
	// Track the published service so we can unpublish it on shutdown.
	let service: ToolgateService | undefined;

	// Resolve the active profile name from the context.
	// Subagent child processes set PI_TOOLGATE_PROFILE to the agent's
	// `permission` field (which names a toolgate profile, e.g. "subagent").
	function resolveProfile(_ctx: { sessionManager?: { getSessionId(): string } }): string {
		const envProfile = process.env.PI_TOOLGATE_PROFILE;
		if (envProfile) return envProfile;
		return "default";
	}

	// ── One-time setup for subagent ask-relay (idempotent, no-op in root) ─
	setupAskStdinReader();
	publishAskRelayBridge();

	// ── session_start: publish the service for inter-extension use ─────
	pi.on("session_start", () => {
		service = publishService();
	});

	// ── session_shutdown: clean up the published service ───────────────
	pi.on("session_shutdown", () => {
		if (service) {
			unpublishService(service);
			service = undefined;
		}
		// Don't reset yoloMode here — it's session-scoped but we keep it
		// for potential reconnection. The command handler manages it.
	});

	// ── /yolo command: toggle aggressive permission mode ──────────
	pi.registerCommand("yolo", {
		description: "Toggle YOLO mode — auto-allow all non-bash tools",
		handler: async (_args, ctx) => {
			yoloMode = !yoloMode;
			if (yoloMode) {
				ctx.ui.setStatus("yolo", ctx.ui.theme.fg("warning", "⚠ YOLO"));
				ctx.ui.notify("YOLO mode ON — all non-bash tools auto-allowed", "warning");
			} else {
				ctx.ui.setStatus("yolo", undefined);
				ctx.ui.notify("YOLO mode OFF — normal permission checks", "info");
			}
		},
	});

	// ── tool_call: the main gate ──────────────────────────────────────
	pi.on("tool_call", async (event, ctx) => {
		// Resolve input: the SDK uses either `input` or `arguments`.
		const input =
			(event as Record<string, unknown>).input ??
			(event as Record<string, unknown>).arguments ??
			{};

		// ── YOLO mode: auto-allow all non-bash tools ─────────────────
		if (yoloMode && event.toolName !== "bash") {
			return; // pass through — allow
		}

		try {
			const profile = resolveProfile(ctx);
			const result: GateResult = evaluate(
				event.toolName,
				input,
				ctx.cwd ?? process.cwd(),
				profile,
			);

			switch (result.action) {
				case "allow":
					return; // Pass through — tool executes normally.

				case "deny":
					return { block: true, reason: result.reason };

				case "ask": {
					// ── Subagent relay path ───────────────────────────────
					// We are inside a subagent child process without a UI.
					// Relay the confirmation request to the parent process
					// (which may itself relay further up until the root pi
					// process with a real TUI is reached).
					if (isSubagentContext()) {
						const title = result.promptTitle ?? `Permission required`;
						const message =
							result.promptMessage ??
							result.reason ??
							`Tool '${event.toolName}' requires your approval.`;

						const decision = await relayAskToParent(
							event.toolName,
							title,
							message,
							event.toolCallId,
						);

						if (!decision.approved) {
							return {
								block: true,
								reason: decision.reason ?? `User denied: ${result.reason ?? `Tool '${event.toolName}'`}`,
							};
						}
						return; // User approved — tool executes normally.
					}

					// ── Root-process path ────────────────────────────────
					// In non-interactive modes (print, JSON, non-UI RPC), deny.
					if (!ctx.hasUI) {
						return {
							block: true,
							reason: result.reason ?? `Tool '${event.toolName}' requires confirmation but no UI is available.`,
						};
					}

					const title = result.promptTitle ?? `Permission required`;
					const message =
						result.promptMessage ??
						result.reason ??
						`Tool '${event.toolName}' requires your approval.`;

					// Serialise through the global confirm queue so that
					// subagent onAsk callbacks (which also call showConfirmWithReason)
					// do not clobber this dialog and vice versa.
					let confirmResult: { approved: boolean; reason?: string } = { approved: false };
					await getConfirmQueue().enqueue(async () => {
						confirmResult = await showConfirmWithReason(ctx, title, message);
						return confirmResult.approved;
					});

					if (!confirmResult.approved) {
						const deniedReason = confirmResult.reason
							? `User denied: ${confirmResult.reason}`
							: `User denied: ${result.reason ?? `Tool '${event.toolName}'`}`;
						return { block: true, reason: deniedReason };
					}
					return; // Allow — user approved.
				}

				default:
					// Exhaustiveness check — should never reach here.
					return { block: true, reason: "Unknown permission state." };
			}
		} catch (err) {
			// Fail-closed: an unexpected error blocks the tool call.
			const message = err instanceof Error ? err.message : String(err);
			return {
				block: true,
				reason: `toolgate error (fail-closed): ${message}`,
			};
		}
	});
}
