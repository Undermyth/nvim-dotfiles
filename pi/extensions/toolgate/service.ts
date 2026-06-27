/**
 * service.ts — Public API published on globalThis for inter-extension use.
 *
 * Other extensions (including future subagent implementations) retrieve
 * the ToolgateService via:
 *
 *   const TOOLGATE = Symbol.for("@toolgate:service");
 *   const svc = (globalThis as any)[TOOLGATE] as ToolgateService;
 *   const result = svc.check("bash", { command: "rm -rf /tmp" });
 *
 * The service is published at session_start by the main agent and
 * unpublished at session_shutdown.
 */

import { type PermissionState } from "./bash-check";
import {
	invalidateCache as reloadConfig,
	getProfile,
	getToolState as lookupToolState,
	hasProfile,
	listProfiles,
} from "./config";
import { clearBashCache, evaluate, type AskDetails, type GateResult } from "./gate";

export { type PermissionState };

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CheckResult {
	/** Resolved permission state. */
	state: "allow" | "ask" | "deny";
	/** Human-readable reason (when not "allow"). */
	reason?: string;
	/** Which config pattern matched (for debugging). */
	matchedPattern?: string;
	/** Rich title for confirmation prompt (when state === "ask"). */
	promptTitle?: string;
	/** Rich message for confirmation prompt (when state === "ask"). */
	promptMessage?: string;
	/** Detailed tool info for richer ask dialogs. */
	details?: AskDetails;
}

/**
 * Public API exposed to other extensions.
 */
export interface ToolgateService {
	/**
	 * Check a tool call against the permission profiles.
	 *
	 * @param toolName     - Tool name (e.g. "bash", "read", "write", "my-ext:tool")
	 * @param input        - Raw input payload ({ command: "..." } for bash, { path: "..." } for file tools)
	 * @param profileName  - Profile to evaluate against (defaults to "default")
	 * @param cwd          - Current working directory for path heuristic
	 */
	check(
		toolName: string,
		input: Record<string, unknown>,
		profileName?: string,
		cwd?: string,
	): CheckResult;

	/**
	 * Get just the tool-level permission state (without input).
	 *
	 * Does not apply bash command-pattern matching or path heuristic.
	 * For bash, returns the default bash state.
	 */
	getToolState(toolName: string, profileName?: string): PermissionState;

	/**
	 * Force-reload config from disk on the next check.
	 */
	reload(): void;

	/**
	 * Check whether a named profile exists.
	 */
	hasProfile(name: string): boolean;

	/**
	 * List all defined profile names.
	 */
	listProfiles(): string[];
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

function createToolgateService(): ToolgateService {
	return {
		check(
			toolName: string,
			input: Record<string, unknown>,
			profileName?: string,
			cwd?: string,
		): CheckResult {
			const result: GateResult = evaluate(
				toolName,
				input,
				cwd ?? process.cwd(),
				profileName,
			);
			return {
				state: result.action,
				reason: result.reason,
				matchedPattern: result.matchedPattern,
				promptTitle: result.promptTitle,
				promptMessage: result.promptMessage,
				details: result.details,
			};
		},

		getToolState(
			toolName: string,
			profileName?: string,
		): PermissionState {
			const { profile } = getProfile(profileName);
			return lookupToolState(profile, toolName);
		},

		reload(): void {
			reloadConfig();
			clearBashCache();
		},

		hasProfile(name: string): boolean {
			return hasProfile(name);
		},

		listProfiles(): string[] {
			return listProfiles();
		},
	};
}

// ---------------------------------------------------------------------------
// Confirm queue — serialises ctx.ui.confirm calls so that tool_call events
// and subagent onAsk callbacks don't clobber each other's dialogs.
// ---------------------------------------------------------------------------

/**
 * A Promise-based queue that serialises asynchronous confirm operations.
 * Ensures only one confirmation dialog is active at a time —
 * later callers wait for the earlier one to resolve.
 */
class ConfirmQueue {
	private tail: Promise<void> = Promise.resolve();
	private taskIdCounter = 0;

	/**
	 * Enqueue a confirm function.  Returns a Promise that resolves with
	 * the boolean returned by `fn` (true = approved, false = denied).
	 * If `fn` throws the returned promise resolves to `false`.
	 */
	enqueue(fn: () => Promise<boolean>): Promise<boolean> {
		let resolveResult!: (v: boolean) => void;
		const result = new Promise<boolean>((r) => {
			resolveResult = r;
		});

		this.tail = this.tail.then(async () => {
			try {
				const approved = await fn();
				resolveResult(approved);
			} catch (_err) {
				resolveResult(false);
			}
		});

		return result;
	}
}

/** Process-global key for the confirm queue. */
const CONFIRM_QUEUE_KEY = Symbol.for("@toolgate:confirm");

/**
 * Brand symbol to verify a ConfirmQueue across jiti module instances.
 * Because the extension loader uses `moduleCache: false`, each extension
 * gets its own copy of this module with a distinct `ConfirmQueue` class.
 * `instanceof` fails across those copies, so we stamp the singleton with
 * a `Symbol.for` brand that is shared across all module instances.
 */
const CONFIRM_QUEUE_BRAND = Symbol.for("@toolgate:confirm-brand");

interface BrandedConfirmQueue extends ConfirmQueue {
	[CONFIRM_QUEUE_BRAND]: true;
}

function isConfirmQueue(value: unknown): value is BrandedConfirmQueue {
	return (
		typeof value === "object" &&
		value !== null &&
		CONFIRM_QUEUE_BRAND in value
	);
}

/** Retrieve (or lazily create) the process-global ConfirmQueue. */
export function getConfirmQueue(): ConfirmQueue {
	const existing = (globalThis as Record<symbol, unknown>)[CONFIRM_QUEUE_KEY];
	if (isConfirmQueue(existing)) return existing;
	const queue: BrandedConfirmQueue = Object.assign(new ConfirmQueue(), {
		[CONFIRM_QUEUE_BRAND]: true as const,
	});
	(globalThis as Record<symbol, unknown>)[CONFIRM_QUEUE_KEY] = queue;
	return queue;
}

// ---------------------------------------------------------------------------
// Confirm-queue bridge — exposed on globalThis so pi-subagents (loaded via
// jiti with separate module instances) can serialise their onAsk →
// ctx.ui.confirm() calls through the same queue that toolgate itself uses.
// ---------------------------------------------------------------------------

const CONFIRM_BRIDGE_KEY = Symbol.for("@toolgate:confirm-bridge");

export function publishConfirmBridge(): void {
	(globalThis as Record<symbol, unknown>)[CONFIRM_BRIDGE_KEY] = {
		enqueue: (fn: () => Promise<boolean>) => getConfirmQueue().enqueue(fn),
	};
}

// ---------------------------------------------------------------------------
// Publish / unpublish
// ---------------------------------------------------------------------------

/** Process-global key for the service slot. */
export const SERVICE_KEY = Symbol.for("@toolgate:service");

/**
 * Publish the service on globalThis.
 *
 * Called at session_start by the parent agent; in-process subagent children
 * skip publishing so they don't overwrite the parent service.
 */
export function publishService(): ToolgateService {
	const service = createToolgateService();
	(globalThis as Record<symbol, unknown>)[SERVICE_KEY] = service;
	publishConfirmBridge();
	return service;
}

/**
 * Remove the service from globalThis if it's still ours.
 */
export function unpublishService(service: ToolgateService): void {
	const current = getService();
	if (current === service) {
		delete (globalThis as Record<symbol, unknown>)[SERVICE_KEY];
	}
}

/**
 * Retrieve the published service (or undefined if not yet published).
 */
export function getService(): ToolgateService | undefined {
	return (globalThis as Record<symbol, unknown>)[SERVICE_KEY] as
		| ToolgateService
		| undefined;
}
