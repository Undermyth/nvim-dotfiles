/**
 * ask-relay.ts — Subprocess ask-IPC relay for toolgate.
 *
 * When toolgate runs inside a subagent child process (detected via
 * PI_TOOLGATE_PROFILE env), "ask" decisions cannot be resolved by a
 * local UI dialog.  Instead we send a JSON event on stdout and await a
 * response on stdin — the parent pi-subagents process reads the event,
 * shows a confirm dialog in the real TUI, and writes the answer back.
 *
 * Nesting is supported: if the parent is itself a subagent, its own
 * toolgate extension will relay the ask one more level up, recursively
 * until it reaches the root pi process with an actual UI.
 *
 * Responses may optionally include a `reason` string explaining why
 * the request was denied (or approved).  Old responders that omit the
 * `reason` field are still compatible — the field defaults to undefined.
 */

// ---------------------------------------------------------------------------
// Pending-request registry
// ---------------------------------------------------------------------------

interface PendingAsk {
	resolve: (result: { approved: boolean; reason?: string }) => void;
	timer: ReturnType<typeof setTimeout>;
}

const pendingAsks = new Map<string, PendingAsk>();

// ---------------------------------------------------------------------------
// Context detection
// ---------------------------------------------------------------------------

/** True when this process is a subagent child (PI_TOOLGATE_PROFILE is set
 *  and is not "default"). */
export function isSubagentContext(): boolean {
	const v = process.env.PI_TOOLGATE_PROFILE;
	return !!v && v !== "default";
}

// ---------------------------------------------------------------------------
// Stdin reader (one-time setup, idempotent)
// ---------------------------------------------------------------------------

let stdinSetupDone = false;

/**
 * Start listening on process.stdin for `toolgate_ask_response` JSON
 * lines and resolve the matching pending Promise.
 *
 * Safe to call multiple times — only the first call activates the reader.
 * In the root process (no PI_TOOLGATE_PROFILE) this is a no-op.
 */
export function setupAskStdinReader(): void {
	if (stdinSetupDone) return;
	stdinSetupDone = true;

	if (!isSubagentContext()) return;

	// stdin may be null when the parent spawns us with stdio: "ignore".
	// In that case ask-relay IPC is unavailable — every ask will time out
	// and deny. Subagents still work; toolgate "ask" just blocks the call.
	if (!process.stdin || process.stdin.destroyed) return;

	process.stdin.setEncoding("utf-8");
	process.stdin.resume();

	let buf = "";

	process.stdin.on("data", (chunk: string) => {
		buf += chunk;
		const lines = buf.split("\n");
		buf = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			try {
				const msg = JSON.parse(trimmed) as Record<string, unknown>;
				if (msg.type === "toolgate_ask_response" && typeof msg.requestId === "string") {
					const pending = pendingAsks.get(msg.requestId);
					if (pending) {
						pendingAsks.delete(msg.requestId);
						clearTimeout(pending.timer);
						pending.resolve({
							approved: !!msg.approved,
							reason: typeof msg.reason === "string" ? msg.reason : undefined,
						});
					}
				}
			} catch {
				// Non-JSON line — expected (pi may emit human-readable output).
			}
		}
	});

	// If the parent process dies or closes our stdin, reject all pending
	// asks so the child doesn't hang forever.
	process.stdin.on("end", () => {
		for (const [id, pending] of pendingAsks) {
			clearTimeout(pending.timer);
			pending.resolve({ approved: false });
			pendingAsks.delete(id);
		}
	});
}

// ---------------------------------------------------------------------------
// Relay a single ask to the parent process
// ---------------------------------------------------------------------------

const ASK_TIMEOUT_MS = 60_000;

/**
 * Send an ask-confirmation request to the parent process and return a
 * Promise that resolves with the user's decision and an optional reason.
 *
 * Writes a `toolgate_ask` JSON line to stdout, then waits for a
 * `toolgate_ask_response` line on stdin (or times out after 60 s).
 *
 * @returns An object with `approved` (boolean) and an optional `reason`
 *   string. `approved` is `true` if the user approved, `false` if denied
 *   or timed out.
 */
export function relayAskToParent(
	toolName: string,
	title: string,
	message: string,
	toolCallId?: string,
): Promise<{ approved: boolean; reason?: string }> {
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

	return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
		const timer = setTimeout(() => {
			const pending = pendingAsks.get(requestId);
			if (pending) {
				pendingAsks.delete(requestId);
				pending.resolve({ approved: false });
			}
		}, ASK_TIMEOUT_MS);

		pendingAsks.set(requestId, { resolve, timer });

		const payload: Record<string, unknown> = {
			type: "toolgate_ask",
			requestId,
			toolName,
			title,
			message,
		};
		if (toolCallId) payload.toolCallId = toolCallId;

		process.stdout.write(JSON.stringify(payload) + "\n");
	});
}

// ---------------------------------------------------------------------------
// Global bridge — exposed so other extensions (pi-subagents) can call
// relayAskToParent / isSubagentContext across jiti module boundaries.
// ---------------------------------------------------------------------------

export const ASK_RELAY_GLOBAL_KEY = Symbol.for("@toolgate:ask-relay");

export function publishAskRelayBridge(): void {
	if (!isSubagentContext()) return;
	(globalThis as Record<symbol, unknown>)[ASK_RELAY_GLOBAL_KEY] = {
		relayAskToParent,
		isSubagentContext,
	};
}
