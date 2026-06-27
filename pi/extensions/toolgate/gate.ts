/**
 * gate.ts — Core permission evaluation for toolgate.
 *
 * Exports the `evaluate()` function that takes a tool name, input payload,
 * CWD, and profile name and returns a GateResult with the appropriate
 * action and reason/message strings.
 */

import { applyPathHeuristic, type PermissionState } from "./bash-check";
import { type BashRules, getBashRules, getProfile, getToolState } from "./config";
import { compileBashPatterns, findMatch, type CompiledPattern } from "./matcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export { type PermissionState };

export interface AskDetails {
	toolName: string;
	toolDisplay: string;
	// Bash
	command?: string;
	// File tools
	path?: string;
	// Edit
	edits?: Array<{ oldText: string; newText: string }>;
	// Write
	contentSnippet?: string;
	contentSize?: string;
	// Read
	offset?: number;
	limit?: number;
	// Grep/Find
	pattern?: string;
	// Generic
	argsPreview?: string;
}

export interface GateResult {
	action: "allow" | "deny" | "ask";
	/** Human-readable reason shown to the user when action ≠ "allow". */
	reason?: string;
	/** Title for the confirmation prompt (only used when action === "ask"). */
	promptTitle?: string;
	/** Message for the confirmation prompt (only used when action === "ask"). */
	promptMessage?: string;
	/** Which pattern matched (for debugging / audit). */
	matchedPattern?: string;
	/** Detailed tool info for richer ask dialogs. */
	details?: AskDetails;
}

// ---------------------------------------------------------------------------
// Cache for compiled bash patterns (per profile, invalidated on reload)
// ---------------------------------------------------------------------------

const compiledBashCache = new Map<string, CompiledPattern[]>();

function getCompiledBashPatterns(
	profileName: string,
	rules: BashRules,
): CompiledPattern[] {
	const cached = compiledBashCache.get(profileName);
	if (cached) return cached;

	const compiled = compileBashPatterns(rules);
	compiledBashCache.set(profileName, compiled);
	return compiled;
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Evaluate a tool call against the configured permission profiles.
 *
 * @param toolName      - The tool being called (e.g. "bash", "read", "write").
 * @param input         - The raw input payload from the tool_call event.
 * @param cwd           - Current working directory (for path heuristic).
 * @param profileName   - Profile to use (defaults to "default").
 * @returns A GateResult indicating whether to allow, deny, or ask.
 */
/** Clear the compiled bash-pattern cache. Called on config reload. */
export function clearBashCache(): void {
	compiledBashCache.clear();
}

export function evaluate(
	toolName: string,
	input: unknown,
	cwd: string,
	profileName?: string,
): GateResult {
	const { profile, profileName: resolvedName } = getProfile(profileName);

	// ── Bash: special command-level filtering ───────────────────────
	if (toolName === "bash") {
		return evaluateBash(input, cwd, profile, resolvedName);
	}

	// ── File-access tools: apply path heuristic ────────────────────
	if (isFileAccessTool(toolName)) {
		return evaluateFileAccess(toolName, input, cwd, profile);
	}

	// ── Generic tool: simple state lookup ──────────────────────────
	const state = getToolState(profile, toolName);
	const details = extractAskDetails(toolName, input);
	return toGateResult(toolName, state, undefined, undefined, details);
}

// ---------------------------------------------------------------------------
// Bash evaluation
// ---------------------------------------------------------------------------

function evaluateBash(
	input: unknown,
	cwd: string,
	profile: ReturnType<typeof getProfile>["profile"],
	profileName: string,
): GateResult {
	const command = extractCommand(input);
	if (!command) {
		// No command string — treat as a generic bash tool access.
		const state = getToolState(profile, "bash");
		const details = extractAskDetails("bash", input);
		return toGateResult("bash", state, undefined, undefined, details);
	}

	// 1. Look up bash rules from the profile.
	const bashRules = getBashRules(profile);
	const toolLevelState = getToolState(profile, "bash");

	if (!bashRules) {
		// No bash-specific rules: use the tool-level state.
		const afterPath = applyPathHeuristic(command, cwd, toolLevelState);
		const details = extractAskDetails("bash", input);
		return toGateResult("bash", afterPath.effectiveState, afterPath.reason, undefined, details);
	}

	// 2. Match the command against compiled patterns.
	const patterns = getCompiledBashPatterns(profileName, bashRules);
	const match = findMatch(patterns, command);

	let resolvedState: PermissionState;
	let matchedPattern: string | undefined;

	if (match) {
		// State is carried directly on the compiled pattern.
		resolvedState = match.state;
		matchedPattern = match.pattern;
	} else {
		// No command pattern matched — fall back to tool-level state.
		resolvedState = toolLevelState;
	}

	// 3. Apply the path heuristic: commands touching paths outside
	//    CWD upgrade allow → ask.
	const afterPath = applyPathHeuristic(command, cwd, resolvedState);

	const details = extractAskDetails("bash", input);
	return toGateResult("bash", afterPath.effectiveState, afterPath.reason ?? undefined, matchedPattern, details);
}

// ---------------------------------------------------------------------------
// File-access tools (read, write, edit, etc.)
// ---------------------------------------------------------------------------

/** Tools whose primary purpose is reading/writing a filesystem path. */
const FILE_ACCESS_TOOLS = new Set(["read", "write", "edit"]);

function isFileAccessTool(toolName: string): boolean {
	return FILE_ACCESS_TOOLS.has(toolName);
}

function evaluateFileAccess(
	toolName: string,
	input: unknown,
	cwd: string,
	profile: ReturnType<typeof getProfile>["profile"],
): GateResult {
	const state = getToolState(profile, toolName);

	// Extract the path from input if present.
	const path = extractPath(input);
	const details = extractAskDetails(toolName, input);
	if (!path) {
		return toGateResult(toolName, state, undefined, undefined, details);
	}

	// Apply path heuristic.
	const dummyCommand = path; // treat the path as a one-token "command"
	const afterPath = applyPathHeuristic(dummyCommand, cwd, state);

	return toGateResult(toolName, afterPath.effectiveState, afterPath.reason, undefined, details);
}

// ---------------------------------------------------------------------------
// AskDetails extraction
// ---------------------------------------------------------------------------

function extractAskDetails(toolName: string, input: unknown): AskDetails {
	const display = TOOL_DISPLAY_NAMES[toolName] ?? `Tool '${toolName}'`;
	const details: AskDetails = { toolName, toolDisplay: display };

	switch (toolName) {
		case "bash": {
			const cmd = extractCommand(input);
			if (cmd) {
				details.command = cmd.length > 500 ? cmd.slice(0, 500) + "..." : cmd;
			}
			break;
		}
		case "read": {
			const rec = toRecord(input);
			const path = rec.path;
			if (typeof path === "string") details.path = path;
			if (typeof rec.offset === "number") details.offset = rec.offset;
			if (typeof rec.limit === "number") details.limit = rec.limit;
			break;
		}
		case "edit": {
			const rec = toRecord(input);
			const path = rec.path;
			if (typeof path === "string") details.path = path;
			const edits = rec.edits;
			if (Array.isArray(edits)) details.edits = edits.map(() => ({ oldText: "", newText: "" }));
			break;
		}
		case "write": {
			const rec = toRecord(input);
			const path = rec.path;
			if (typeof path === "string") details.path = path;
			if (typeof rec.content === "string") {
				details.contentSize = formatBytes(rec.content.length);
			}
			break;
		}
		case "ffgrep":
		case "grep": {
			const rec = toRecord(input);
			if (typeof rec.pattern === "string") details.pattern = rec.pattern;
			break;
		}
		case "fffind":
		case "find": {
			const rec = toRecord(input);
			if (typeof rec.pattern === "string") details.pattern = rec.pattern;
			break;
		}
		default: {
			// Generic: serialize input as JSON and truncate.
			try {
				const json = JSON.stringify(input);
				details.argsPreview = json.length > 200 ? json.slice(0, 200) + "..." : json;
			} catch {
				details.argsPreview = String(input).slice(0, 200);
			}
			break;
		}
	}

	return details;
}

// ---------------------------------------------------------------------------
// Input extractors
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

function extractCommand(input: unknown): string {
	const record = toRecord(input);
	const cmd = record.command;
	return typeof cmd === "string" ? cmd : "";
}

function extractPath(input: unknown): string | undefined {
	const record = toRecord(input);
	const p = record.path;
	return typeof p === "string" ? p : undefined;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + "B";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
	return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

const TOOL_DISPLAY_NAMES: Record<string, string> = {
	bash: "Run shell command",
	read: "Read file",
	write: "Write file",
	edit: "Edit file",
};

const ACTION_LABELS: Record<PermissionState, string> = {
	allow: "allowed",
	ask: "requires confirmation",
	deny: "blocked",
};

function toGateResult(
	toolName: string,
	state: PermissionState,
	reason?: string,
	matchedPattern?: string,
	details?: AskDetails,
): GateResult {
	if (state === "allow") {
		return { action: "allow" };
	}

	const display = TOOL_DISPLAY_NAMES[toolName] ?? `Tool '${toolName}'`;
	const label = ACTION_LABELS[state];

	const baseReason = reason ?? `Policy for '${toolName}' is set to '${state}'`;

	if (state === "deny") {
		return {
			action: "deny",
			reason: baseReason,
			matchedPattern,
			details,
		};
	}

	// state === "ask" — build a rich prompt message from details if available.
	const richMessage = buildAskMessage(toolName, display, baseReason, details);

	return {
		action: "ask",
		reason: baseReason,
		promptTitle: `${display}`,
		promptMessage: richMessage,
		matchedPattern,
		details,
	};
}

// ---------------------------------------------------------------------------
// Rich ask-prompt message builder
// ---------------------------------------------------------------------------

function buildAskMessage(
	toolName: string,
	display: string,
	baseReason: string,
	details?: AskDetails,
): string {
	const label = "requires confirmation";

	// If no details, fall back to the original simple format.
	if (!details) {
		return `${display} ${label}.\n\n${baseReason}\n\nAllow this operation?`;
	}

	// Build a detail-rich header section.
	let header = "";

	switch (toolName) {
		case "bash": {
			if (details.command) {
				header = `Command:\n  ${details.command}\n`;
			}
			break;
		}
		case "edit": {
			if (details.path) {
				const editCount = details.edits ? ` (${details.edits.length} edit${details.edits.length > 1 ? "s" : ""})` : "";
				header = `File: ${details.path}${editCount}\n`;
			}
			break;
		}
		case "write": {
			if (details.path) {
				const sizeInfo = details.contentSize ? ` (${details.contentSize})` : "";
				header = `File: ${details.path}${sizeInfo}\n`;
			}
			break;
		}
		case "read": {
			if (details.path) {
				header = `File: ${details.path}\n`;
			}
			break;
		}
		case "ffgrep":
		case "grep":
		case "fffind":
		case "find": {
			if (details.pattern) {
				header = `Pattern: "${details.pattern}"\n`;
			}
			break;
		}
		default: {
			if (details.argsPreview) {
				header = `Args:\n  ${details.argsPreview}\n`;
			}
			break;
		}
	}

	return `${header}\n${baseReason}\n\nAllow this operation?`;
}
