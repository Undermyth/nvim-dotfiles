/**
 * config.ts — Configuration loading, validation, and caching for toolgate.
 *
 * Reads a single JSON file at:
 *   ~/.pi/agent/extensions/toolgate/config.json
 *
 * The config is cached in memory and re-read from disk only when
 * `reload()` is called or the file's mtime has changed (checked on
 * each access).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionState = "allow" | "ask" | "deny";

const PERMISSION_STATES = new Set<string>(["allow", "ask", "deny"]);

/** Command-level patterns within a bash profile. */
export interface BashRules {
	"*": PermissionState;
	[commandPattern: string]: PermissionState;
}

/**
 * A single profile.
 *
 * Each key is either:
 * - `"*"`      → default tool behaviour
 * - `toolName` → per-tool behaviour (a PermissionState, or BashRules for "bash")
 */
export interface ProfileConfig {
	"*": PermissionState;
	[toolName: string]: PermissionState | BashRules;
}

/** The top-level config document. */
export interface ToolgateConfig {
	"default": ProfileConfig;
	[profileName: string]: ProfileConfig;
}

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".pi", "agent", "extensions", "toolgate");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cached: ToolgateConfig | null = null;
let cachedMtime = 0;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load the toolgate config from disk.
 *
 * If the config file doesn't exist, creates one with safe defaults
 * (ask-everything). If the file is invalid JSON, falls back to a
 * safe in-memory default (no disk write — the user should fix it).
 */
export function loadConfig(): ToolgateConfig {
	// ── Hit the mtime-based cache ───────────────────────────────────
	let mtime = 0;
	try {
		mtime = statSync(CONFIG_PATH).mtimeMs;
	} catch {
		// File doesn't exist — handled below.
	}
	if (mtime > 0 && mtime === cachedMtime && cached !== null) {
		return cached;
	}

	// ── Missing file: create default config ────────────────────────
	if (mtime === 0 && !existsSync(CONFIG_PATH)) {
		console.warn(
			`[toolgate] Config not found at ${CONFIG_PATH}; creating with default (ask-everything).`,
		);
		const defaults: ToolgateConfig = {
			default: { "*": "ask" },
		};
		try {
			mkdirSync(CONFIG_DIR, { recursive: true });
			writeFileSync(
				CONFIG_PATH,
				JSON.stringify(defaults, null, 2) + "\n",
				"utf-8",
			);
		} catch {
			// Can't write — use in-memory default.
		}
		cached = defaults;
		cachedMtime = 0;
		return defaults;
	}

	// ── Read & parse ────────────────────────────────────────────────
	let parsed: unknown;
	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		parsed = JSON.parse(raw);
	} catch (err) {
		console.warn(
			`[toolgate] Failed to parse ${CONFIG_PATH}: ${(err as Error).message}. Falling back to ask-everything.`,
		);
		const defaults: ToolgateConfig = { default: { "*": "ask" } };
		cached = defaults;
		cachedMtime = 0;
		return defaults;
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		console.warn(
			"[toolgate] config.json must be a JSON object. Falling back to ask-everything.",
		);
		const defaults: ToolgateConfig = { default: { "*": "ask" } };
		cached = defaults;
		cachedMtime = 0;
		return defaults;
	}

	const validated = validateConfig(parsed as Record<string, unknown>);
	cached = validated;
	cachedMtime = mtime;
	return validated;
}

/**
 * Force a reload on the next access.
 */
export function invalidateCache(): void {
	cachedMtime = 0;
}

// ---------------------------------------------------------------------------
// Profile access
// ---------------------------------------------------------------------------

/**
 * Get a specific profile by name.
 *
 * Falls back to `"default"` when the requested profile doesn't exist,
 * and returns the full config alongside the resolved profile so callers
 * always have something to work with.
 */
export function getProfile(name?: string): {
	config: ToolgateConfig;
	profile: ProfileConfig;
	profileName: string;
} {
	const config = loadConfig();
	if (name && config[name]) {
		return { config, profile: config[name], profileName: name };
	}
	return { config, profile: config["default"], profileName: "default" };
}

/**
 * Check whether a named profile exists.
 */
export function hasProfile(name: string): boolean {
	const config = loadConfig();
	return name in config;
}

/**
 * List all defined profile names.
 */
export function listProfiles(): string[] {
	return Object.keys(loadConfig());
}

// ---------------------------------------------------------------------------
// Bash helpers
// ---------------------------------------------------------------------------

/**
 * Extract the BashRules from a profile's entry for the "bash" tool.
 *
 * If `"bash"` is set to a plain PermissionState string, wraps it as
 * `{ "*": state }`. If the key doesn't exist, returns undefined.
 */
export function getBashRules(profile: ProfileConfig): BashRules | undefined {
	const entry = profile["bash"];
	if (entry === undefined) return undefined;
	if (typeof entry === "string") {
		return { "*": entry as PermissionState };
	}
	// It's an object — assume it's BashRules.
	return entry as BashRules;
}

// ---------------------------------------------------------------------------
// Tool-level state lookup
// ---------------------------------------------------------------------------

/**
 * Look up the resolved PermissionState for a tool in a profile.
 *
 * Order:
 * 1. Exact match on toolName → return its state.
 * 2. For "bash": if profile has bash rules, return bash["*"].
 * 3. Fallback to profile["*"].
 */
export function getToolState(
	profile: ProfileConfig,
	toolName: string,
): PermissionState {
	// Exact match.
	const entry = profile[toolName];
	if (typeof entry === "string") return entry as PermissionState;

	// Bash object entry — use its wildcard default.
	if (toolName === "bash" && entry && typeof entry === "object") {
		return (entry as BashRules)["*"] ?? profile["*"];
	}

	// Fallback to profile default.
	return profile["*"];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateConfig(config: Record<string, unknown>): ToolgateConfig {
	const validated: ToolgateConfig = {} as ToolgateConfig;

	for (const [key, value] of Object.entries(config)) {
		// Skip $schema and other metadata keys.
		if (key === "$schema") continue;

		if (!value || typeof value !== "object" || Array.isArray(value)) {
			console.warn(
				`[toolgate] Skipping profile "${key}": must be an object`,
			);
			continue;
		}

		try {
			validated[key] = validateProfile(key, value as Record<string, unknown>);
		} catch (err) {
			console.warn(`[toolgate] ${(err as Error).message}`);
		}
	}

	// At minimum, "default" must exist.
	if (!validated["default"]) {
		// Create a safe fallback default: ask everything.
		validated["default"] = { "*": "ask" };
		console.warn("[toolgate] No valid 'default' profile; falling back to ask-everything.");
	}

	return validated;
}

function validateProfile(
	name: string,
	obj: Record<string, unknown>,
): ProfileConfig {
	const profile: ProfileConfig = {} as ProfileConfig;

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === "string") {
			const state = value.trim().toLowerCase();
			if (PERMISSION_STATES.has(state)) {
				profile[key] = state as PermissionState;
			} else {
				console.warn(
					`[toolgate] Profile "${name}" key "${key}": invalid state "${value}" (must be allow/ask/deny)`,
				);
			}
		} else if (value && typeof value === "object" && !Array.isArray(value)) {
			// Nested object — for now, only "bash" is expected.
			if (key === "bash") {
				profile[key] = validateBashRules(name, value as Record<string, unknown>);
			} else {
				console.warn(
					`[toolgate] Profile "${name}" key "${key}": nested objects only supported for "bash"`,
				);
			}
		} else {
			console.warn(
				`[toolgate] Profile "${name}" key "${key}": must be a state string or (for "bash") an object`,
			);
		}
	}

	// Ensure "*" exists.
	if (!profile["*"]) {
		profile["*"] = "ask";
		console.warn(
			`[toolgate] Profile "${name}" missing "*" default; assuming "ask".`,
		);
	}

	return profile;
}

function validateBashRules(
	profileName: string,
	obj: Record<string, unknown>,
): BashRules {
	const rules: BashRules = {} as BashRules;

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value !== "string") {
			console.warn(
				`[toolgate] Profile "${profileName}" bash."${key}": must be a state string`,
			);
			continue;
		}
		const state = value.trim().toLowerCase();
		if (PERMISSION_STATES.has(state)) {
			rules[key] = state as PermissionState;
		} else {
			console.warn(
				`[toolgate] Profile "${profileName}" bash."${key}": invalid state "${value}"`,
			);
		}
	}

	if (!rules["*"]) {
		rules["*"] = "ask";
		console.warn(
			`[toolgate] Profile "${profileName}" bash missing "*" default; assuming "ask".`,
		);
	}

	return rules;
}
