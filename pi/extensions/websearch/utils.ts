/**
 * Websearch Extension - HTTP Transport Layer
 *
 * JSON-RPC 2.0 over Streamable HTTP for MCP (Model Context Protocol).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WebSearchConfig {
	url: string;
	token: string;
}

/**
 * Resolve `${VAR}` and `$VAR` placeholders in a string value against process.env.
 */
export function resolveEnv(value: string): string {
	return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "")
		.replace(/\$(\w+)/g, (_, name) => process.env[name] ?? "");
}

/**
 * Load config from ~/.pi/agent/extensions/websearch/config.json.
 * Returns defaults when the file is missing.
 */
export function loadConfig(extensionsDir: string): WebSearchConfig {
	const configPath = resolve(extensionsDir, "websearch", "config.json");
	const defaults: WebSearchConfig = {
		url: "https://searxng.chensy.moe/servers/searxng/mcp",
		token: "",
	};

	if (!existsSync(configPath)) return defaults;

	try {
		const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
		return {
			url: (typeof raw.url === "string" ? raw.url : defaults.url).trim(),
			token: resolveEnv(typeof raw.token === "string" ? raw.token : defaults.token).trim(),
		};
	} catch {
		console.error("[websearch] Failed to parse config.json, using defaults");
		return defaults;
	}
}

// ---------------------------------------------------------------------------
// JSON-RPC Transport
// ---------------------------------------------------------------------------

let nextId = 1;

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number;
	result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
	error?: { code: number; message: string; data?: unknown };
}

/**
 * Call an MCP tool over Streamable HTTP / JSON-RPC 2.0.
 *
 * @param config  - Resolved websearch config (url + token).
 * @param toolName - MCP tool name (e.g. "searxng_web_search").
 * @param args     - Tool arguments matching the inputSchema.
 * @param signal   - AbortSignal for cancellation / timeout.
 */
export async function callMcpTool(
	config: WebSearchConfig,
	toolName: string,
	args: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<string> {
	const id = nextId++;

	const request: JsonRpcRequest = {
		jsonrpc: "2.0",
		id,
		method: "tools/call",
		params: { name: toolName, arguments: args },
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"Accept": "application/json",
	};
	if (config.token) {
		headers["Authorization"] = `Bearer ${config.token}`;
	}

	let response: Response;
	try {
		response = await fetch(config.url, {
			method: "POST",
			headers,
			body: JSON.stringify(request),
			signal,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return `[websearch] Network error calling ${config.url}: ${msg}`;
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "(unable to read body)");
		return `[websearch] HTTP ${response.status} from ${config.url}: ${body.slice(0, 500)}`;
	}

	let data: JsonRpcResponse;
	try {
		data = (await response.json()) as JsonRpcResponse;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return `[websearch] Failed to parse JSON response: ${msg}`;
	}

	if (data.error) {
		return `[websearch] JSON-RPC error ${data.error.code}: ${data.error.message}`;
	}

	const content = data.result?.content;
	if (!content || !Array.isArray(content) || content.length === 0) {
		return "[websearch] Empty response from server";
	}

	return content
		.filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
}
