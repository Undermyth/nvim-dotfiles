/**
 * bash-check.ts — Path-analysis heuristic for bash commands.
 *
 * When a bash command targets a file or directory outside the current
 * working directory (CWD), the effective permission is upgraded:
 *   allow → ask    (needs user consent)
 *   ask   → ask    (stays the same)
 *   deny  → deny   (explicit deny always wins)
 *
 * Path detection is heuristic — it tokenizes the command string and
 * looks for tokens that resemble file-system paths. It is not a full
 * shell parser and may miss some paths or flag some non-path tokens.
 * This is intentional: false positives err on the side of safety.
 */

import { resolve, sep, isAbsolute } from "node:path";
import { platform } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionState = "allow" | "ask" | "deny";

export interface PathCheckResult {
	/** Upgraded effective state after applying the path heuristic. */
	effectiveState: PermissionState;
	/**
	 * Reason string, set when the state was upgraded from allow → ask
	 * because the command touches paths outside CWD.
	 */
	reason?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Examine a bash command for paths outside CWD and adjust the permission
 * state accordingly.
 *
 * @param command       - The full bash command string.
 * @param cwd           - Current working directory (absolute path).
 * @param currentState  - The permission state resolved from config rules.
 * @returns Upgraded state and optional reason.
 */
export function applyPathHeuristic(
	command: string,
	cwd: string,
	currentState: PermissionState,
): PathCheckResult {
	// Deny is always terminal — never downgrade it.
	if (currentState === "deny") {
		return { effectiveState: "deny" };
	}

	const { outsideCwd } = extractPaths(command, cwd);

	// No external paths detected → keep current state.
	if (outsideCwd.length === 0) {
		return { effectiveState: currentState };
	}

	// Paths outside CWD detected.
	if (currentState === "allow") {
		const sample = outsideCwd.slice(0, 3).join(", ");
		const suffix = outsideCwd.length > 3 ? ` (+${outsideCwd.length - 3} more)` : "";
		return {
			effectiveState: "ask",
			reason: `Accesses path(s) outside working directory: ${sample}${suffix}`,
		};
	}

	// currentState is "ask" → stays "ask".
	return { effectiveState: "ask" };
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

interface ExtractedPaths {
	insideCwd: string[];
	outsideCwd: string[];
}

/**
 * Tokenize a command string and classify any path-like tokens as
 * inside or outside the given CWD.
 */
function extractPaths(command: string, cwd: string): ExtractedPaths {
	const tokens = splitCommand(command);
	const normalizedCwd = resolve(cwd);
	const inside: string[] = [];
	const outside: string[] = [];

	for (const token of tokens) {
		if (!looksLikePath(token)) continue;

		try {
			const resolved = resolve(cwd, token);
			if (isWithin(resolved, normalizedCwd)) {
				inside.push(resolved);
			} else {
				outside.push(resolved);
			}
		} catch {
			// Invalid path → ignore safely.
		}
	}

	return { insideCwd: inside, outsideCwd: outside };
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Split a command string into whitespace-delimited tokens while
 * preserving quoted segments as single tokens.
 *
 * Handles single quotes, double quotes, and backslash-escaped characters.
 * Does NOT handle:
 * - Command substitution $(...)
 * - Subshells (...)
 * - Pipes, redirects, etc.
 *
 * Those would require a real shell parser (tree-sitter) — out of scope.
 */
function splitCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	let escape = false;

	for (const ch of command) {
		if (escape) {
			current += ch;
			escape = false;
			continue;
		}

		if (ch === "\\") {
			escape = true;
			current += ch;
			continue;
		}

		if (inSingle) {
			current += ch;
			if (ch === "'") inSingle = false;
			continue;
		}

		if (inDouble) {
			current += ch;
			if (ch === '"') inDouble = false;
			continue;
		}

		if (ch === "'") {
			inSingle = true;
			current += ch;
			continue;
		}

		if (ch === '"') {
			inDouble = true;
			current += ch;
			continue;
		}

		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += ch;
	}

	if (current.length > 0) tokens.push(current);
	return tokens;
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

const win32 = platform() === "win32";

/**
 * Heuristic: does `token` look like a filesystem path?
 *
 * Matches:
 * - Absolute paths: /foo/bar, C:\Users\...
 * - Relative paths: ./foo, ../bar, ~/baz
 * - Tokens containing path separators: foo/bar
 * - Tokens with common file extensions: file.txt, config.json
 * - Windows drive letters: C:file.txt
 *
 * Skips:
 * - Flags: -rf, --force, --flag=value
 * - Command names (typically single words without slashes/extensions)
 * - Shell operators: |, ;, &&, ||, <, >, &
 */
function looksLikePath(token: string): boolean {
	if (token.length === 0) return false;

	// Skip flags and options.
	if (token.startsWith("-")) return false;

	// Skip shell operators.
	if (/^[|&;<>]$/.test(token)) return false;

	// Absolute paths (Unix & Windows).
	if (isAbsolute(token)) return true;

	// Relative paths with explicit prefixes.
	if (token.startsWith("." + sep) || token.startsWith(".." + sep)) return true;

	// Home directory.
	if (token.startsWith("~" + sep) || token === "~") return true;

	// Contains path separators (but not just a single separator).
	if (token.includes(sep) && token !== sep) return true;

	// Forward-slash paths on Windows (e.g. from git-bash / msys).
	if (win32 && token.startsWith("/") && token.length > 1) return true;

	// Drive-letter relative on Windows (e.g. C:file.txt).
	if (win32 && /^[A-Za-z]:[^\\/]/.test(token)) return true;

	// Has a common file extension.
	if (/\.[a-zA-Z0-9]{1,10}$/.test(token)) return true;

	return false;
}

/**
 * Check whether `path` is equal to or a descendant of `parent`.
 */
function isWithin(path: string, parent: string): boolean {
	if (path === parent) return true;
	const prefix = parent.endsWith(sep) ? parent : parent + sep;
	return path.startsWith(prefix);
}
