/**
 * Websearch Extension
 *
 * Exposes SearXNG MCP tools (web search, suggestions, instance info,
 * URL reader) via Streamable HTTP / JSON-RPC 2.0 transport.
 *
 * Config: ~/.pi/agent/extensions/websearch/config.json
 *   { "url": "https://...", "token": "${XNG_KEY}" }
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { callMcpTool, loadConfig, type WebSearchConfig } from "./utils.ts";
import { platform } from "node:os";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export default function websearchExtension(pi: ExtensionAPI): void {
	// Resolve the directory of this extension file (hack: derive from utils).
	// utils.ts lives next to index.ts.
	let parentDir = new URL(".", import.meta.url).pathname;
	// On Windows, URL.pathname produces /C:/foo which path.resolve
	// misinterprets. Strip the leading slash for Win32.
	if (platform() === "win32" && /^\/[a-zA-Z]:\//.test(parentDir)) {
		parentDir = parentDir.slice(1);
	}
	const extensionsDir = parentDir.replace(/\/websearch\/$/, "");
	const config: WebSearchConfig = loadConfig(extensionsDir);

	if (!config.url) {
		console.error("[websearch] No MCP URL configured; websearch tools will fail.");
	}

	// Shared execute helper – thin wrapper around the JSON-RPC transport.
	async function executeTool(
		toolName: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<string> {
		// Combine extension abort signal with a 60-second hard timeout.
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60_000);
		const combined = combineSignals(signal, controller.signal);
		try {
			return await callMcpTool(config, toolName, params, combined);
		} finally {
			clearTimeout(timeout);
		}
	}

	// ---------------------------------------------------------------
	// 1. searxng_web_search
	// ---------------------------------------------------------------
	pi.registerTool({
		name: "searxng_web_search",
		label: "Web Search",
		description:
			"Searches the web using SearXNG and returns a list of results, each with a title, URL, and content snippet. CRITICAL: The required parameter name is exactly `query` (not `prompt`, `q`, or any other name). Calls an external SearXNG instance; availability depends on the `SEARXNG_URL` configuration. Use `pageno` to paginate results; combine `time_range` and `language` to narrow scope. To read the full text of a result URL, follow up with `web_url_read`.",
		promptSnippet: "Web search via SearXNG – returns titles, URLs, and snippets",
		promptGuidelines: [
			"searxng_web_search is read-only and queries an external SearXNG instance. Use `query` (not `prompt`/`q`) as the parameter name. Use `pageno` for pagination, `time_range` and `language` to narrow results. Follow up with `web_url_read` to read full result pages.",
		],
		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("Web Search ")) + theme.fg("accent", args.query);
			const flags: string[] = [];
			if (args.pageno && args.pageno > 1) flags.push(`page ${args.pageno}`);
			if (args.language && args.language !== "all") flags.push(`lang: ${args.language}`);
			if (args.time_range) flags.push(args.time_range);
			if (flags.length > 0) text += " " + theme.fg("dim", `(${flags.join(", ")})`);
			return new Text(text, 0, 0);
		},
		parameters: Type.Object({
			query: Type.String({ description: "The search query string." }),
			pageno: Type.Optional(Type.Number({ description: "Search page number (starts at 1)", default: 1 })),
			time_range: Type.Optional(
				StringEnum(["day", "week", "month", "year"] as const),
			),
			language: Type.Optional(
				Type.String({ description: "Language code for search results (e.g. 'en', 'fr', 'de')", default: "all" }),
			),
			safesearch: Type.Optional(
				Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)], {
					description: "Safe search filter level (0: None, 1: Moderate, 2: Strict)",
				}),
			),
			min_score: Type.Optional(
				Type.Number({
					description: "Minimum relevance score threshold from 0.0 to 1.0.",
					minimum: 0,
					maximum: 1,
				}),
			),
			num_results: Type.Optional(
				Type.Number({ description: "Maximum number of results to return (1-20)", minimum: 1, maximum: 20 }),
			),
			categories: Type.Optional(
				Type.String({
					description:
						"Comma-separated SearXNG categories. Values are normalized case-insensitively to canonical names from live /config; unknown values are rejected with available categories listed.",
				}),
			),
			engines: Type.Optional(
				Type.String({
					description:
						"Comma-separated SearXNG engine names to query (e.g. 'google,bing,ddg'). Values are normalized case-insensitively.",
				}),
			),
			response_format: Type.Optional(
				StringEnum(["text", "json"] as const),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const text = await executeTool("searxng_web_search", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ---------------------------------------------------------------
	// 2. searxng_search_suggestions
	// ---------------------------------------------------------------
	pi.registerTool({
		name: "searxng_search_suggestions",
		label: "Search Suggestions",
		description:
			"Returns autocomplete suggestions from the configured SearXNG instance. Use this to refine vague or partial queries before searching.",
		promptSnippet: "Autocomplete suggestions from SearXNG",
		promptGuidelines: [
			"searxng_search_suggestions is read-only. Use it to refine vague or partial queries before issuing a full searxng_web_search.",
		],
		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("Suggestions ")) + theme.fg("accent", args.query);
			if (args.language && args.language !== "all") {
				text += " " + theme.fg("dim", `(lang: ${args.language})`);
			}
			return new Text(text, 0, 0);
		},
		parameters: Type.Object({
			query: Type.String({ description: "Partial or complete query to autocomplete." }),
			language: Type.Optional(
				Type.String({ description: "Language code for suggestions (e.g. 'en', 'fr', 'de') or 'all'.", default: "all" }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const text = await executeTool("searxng_search_suggestions", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ---------------------------------------------------------------
	// 3. searxng_instance_info
	// ---------------------------------------------------------------
	pi.registerTool({
		name: "searxng_instance_info",
		label: "Instance Info",
		description:
			"Discovers capabilities from the configured SearXNG instance via /config, including categories, engines, defaults, locales, and plugins.",
		promptSnippet: "Query SearXNG instance capabilities (categories, engines, etc.)",
		promptGuidelines: [
			"searxng_instance_info is read-only. Use it to discover available engines, categories, and locales before issuing searches.",
		],
		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("Instance Info"));
			const flags: string[] = [];
			if (args.category) flags.push(`category: ${args.category}`);
			if (args.includeEngines) flags.push("+engines");
			if (args.includeDisabled) flags.push("+disabled");
			if (args.refresh) flags.push("refresh");
			if (flags.length > 0) text += " " + theme.fg("dim", `(${flags.join(", ")})`);
			return new Text(text, 0, 0);
		},
		parameters: Type.Object({
			includeEngines: Type.Optional(
				Type.Boolean({ description: "Include enabled engine names in the response.", default: false }),
			),
			includeDisabled: Type.Optional(
				Type.Boolean({ description: "Include disabled engine names when includeEngines is true.", default: false }),
			),
			category: Type.Optional(
				Type.String({ description: "Filter categories and engines to a single category name." }),
			),
			refresh: Type.Optional(
				Type.Boolean({ description: "Bypass the process cache and fetch fresh /config data.", default: false }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const text = await executeTool("searxng_instance_info", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	// ---------------------------------------------------------------
	// 4. web_url_read
	// ---------------------------------------------------------------
	pi.registerTool({
		name: "web_url_read",
		label: "Read URL",
		description:
			"Fetches a URL and returns its text content converted to markdown. Three modes: (1) Full content — omit filtering params; use `startChar`/`maxLength` to paginate large pages. (2) Section extraction — set `section` to return content under a specific heading. (3) Headings only — set `readHeadings: true` to list all headings (mutually exclusive with other filtering params). Returns an error string if the URL is unreachable or content cannot be extracted. Use after `searxng_web_search` to read the full content of individual result URLs.",
		promptSnippet: "Fetch a URL and return its content as markdown",
		promptGuidelines: [
			"web_url_read is read-only. Use it after searxng_web_search to fetch the full content of result URLs. Three modes: full content, section extraction (set `section`), or headings-only (set `readHeadings: true`).",
		],
		renderCall(args, theme, _context) {
			const urlDisplay = args.url.length > 80 ? args.url.slice(0, 77) + "..." : args.url;
			let text = theme.fg("toolTitle", theme.bold("Read URL ")) + theme.fg("accent", urlDisplay);
			const flags: string[] = [];
			if (args.readHeadings) flags.push("headings");
			if (args.section) flags.push(`section: ${args.section}`);
			if (args.startChar || args.maxLength) {
				const parts: string[] = [];
				if (args.startChar) parts.push(`start=${args.startChar}`);
				if (args.maxLength) parts.push(`max=${args.maxLength}`);
				flags.push(parts.join(", "));
			}
			if (flags.length > 0) text += " " + theme.fg("dim", `(${flags.join(", ")})`);
			return new Text(text, 0, 0);
		},
		parameters: Type.Object({
			url: Type.String({ description: "URL" }),
			startChar: Type.Optional(
				Type.Number({ description: "Starting character position for content extraction", minimum: 0 }),
			),
			maxLength: Type.Optional(
				Type.Number({ description: "Maximum number of characters to return", minimum: 1 }),
			),
			section: Type.Optional(
				Type.String({ description: "Extract content under a specific heading (searches for heading text)" }),
			),
			paragraphRange: Type.Optional(
				Type.String({ description: "Return specific paragraph ranges (e.g., '1-5', '3', '10-')" }),
			),
			readHeadings: Type.Optional(
				Type.Boolean({ description: "Return only a list of headings instead of full content" }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const text = await executeTool("web_url_read", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text }], details: {} };
		},
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Combine multiple AbortSignals. If any signal aborts, the combined signal aborts.
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
	const defined = signals.filter((s): s is AbortSignal => s != null);
	if (defined.length === 0) return undefined;
	if (defined.length === 1) return defined[0];

	const controller = new AbortController();
	for (const s of defined) {
		if (s.aborted) {
			controller.abort(s.reason);
			break;
		}
		s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
	}
	return controller.signal;
}
