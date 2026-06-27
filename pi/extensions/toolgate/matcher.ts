/**
 * matcher.ts — Wildcard-to-regex conversion for toolgate command patterns.
 *
 * Translates glob-style patterns (e.g. "rm *", "git push --force *")
 * into RegExp instances for matching against raw bash commands.
 *
 * Key behavior:
 * - `*` matches any sequence of characters (greedy)
 * - `?` matches exactly one character
 * - A trailing ` *` (space + star) is made optional so "rm *" matches both
 *   "rm" and "rm -rf /tmp" (mirrors the pi-permission-system semantics)
 * - All other regex-special characters are escaped
 * - On Windows (win32), matching is case-insensitive
 */

import { platform } from "node:os";
import type { PermissionState } from "./bash-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompiledPattern {
	/** The original glob pattern (e.g. "rm *") */
	pattern: string;
	/** The permission state this pattern maps to. */
	state: PermissionState;
	/** The compiled regex. */
	regex: RegExp;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/** Escape regex-special characters except `*` and `?` (our wildcards). */
function escapeRegExp(value: string): string {
	return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a wildcard pattern string into a `CompiledPattern`.
 *
 * @param pattern  - Glob pattern (e.g. "rm *", "git push --force *")
 * @param state    - The permission state for this pattern
 * @param options  - Optional: { caseInsensitive: boolean }
 */
export function compilePattern(
	pattern: string,
	state: PermissionState,
	options?: { caseInsensitive?: boolean },
): CompiledPattern {
	let src = escapeRegExp(pattern)
		// Replace `*` (glob wildcard) with `.*` (regex greedy)
		.split("*")
		.join(".*")
		// Replace `?` (glob single-char) with `.` (regex single-char)
		.replaceAll("\\?", ".");

	// Trailing ` .*` → make the space-and-arguments portion optional.
	// "rm *" → matches "rm" and "rm -rf /tmp" alike.
	if (src.endsWith(" .*")) {
		src = `${src.slice(0, -3)}( .*)?`;
	}

	const flags = options?.caseInsensitive ? "si" : "s";
	return { pattern, state, regex: new RegExp(`^${src}$`, flags) };
}

/**
 * Compile multiple (pattern, state) entries in one pass.
 */
export function compilePatterns(
	entries: Array<readonly [string, PermissionState]>,
	options?: { caseInsensitive?: boolean },
): CompiledPattern[] {
	return entries.map(([pattern, state]) =>
		compilePattern(pattern, state, options),
	);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Return the *last* matching compiled pattern from an ordered list,
 * or `null` when no pattern matches.
 *
 * Last-match-wins ensures that later (higher-priority) patterns override
 * earlier ones when multiple patterns could match the same input.
 */
export function findMatch(
	patterns: readonly CompiledPattern[],
	value: string,
): CompiledPattern | null {
	return patterns.findLast((p) => p.regex.test(value)) ?? null;
}

/**
 * Quick check: does `value` match a single `pattern` string?
 *
 * Convenience wrapper for cases where only one pattern needs checking.
 */
export function wildcardMatch(
	pattern: string,
	value: string,
	options?: { caseInsensitive?: boolean },
): boolean {
	return compilePattern(pattern, "allow", options).regex.test(value);
}

// ---------------------------------------------------------------------------
// Bash-pattern helpers
// ---------------------------------------------------------------------------

/**
 * Build an ordered array of compiled patterns from a BashRules object.
 *
 * Order: `"*"` first (lowest priority), then specific patterns in
 * the order they appear in the object. Last-match-wins ensures that
 * more specific patterns override the catch-all.
 */
export function compileBashPatterns(
	rules: Record<string, PermissionState>,
): CompiledPattern[] {
	const win32 = platform() === "win32";

	// Separate "*" from specific patterns.
	const specific = Object.entries(rules).filter(([k]) => k !== "*");

	// "*" first (lowest priority) → specific patterns after (higher priority)
	const ordered: Array<[string, PermissionState]> = [
		["*", rules["*"] ?? "ask"],
		...specific,
	];

	return compilePatterns(ordered, { caseInsensitive: win32 });
}
