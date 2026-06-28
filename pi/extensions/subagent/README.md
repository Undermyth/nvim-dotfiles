# Subagent Extension

**Background sub-agents for Pi — delegate independent work to disposable child agents with their own context, tools, and model.**

The subagent extension lets the main Pi agent (or another subagent) spawn independent background agents that run LLM conversations with their own tool access, separate context windows, and configurable permission profiles. Sub-agents can spawn sub-sub-agents recursively (up to a configured depth), enabling a modular task-decomposition pattern.

---

## Overview

When the main agent faces a large or unfamiliar codebase, it can burn its finite context window on exploration before it ever gets to editing. Subagents fix this by offloading exploration, research, and other side-tasks to disposable child agents whose context is completely isolated. The main agent receives only the summary output.

### Built-in subagent types

Three subagent types ship with the extension:

| Type | Role | Tools | Recursive |
|------|------|-------|-----------|
| **worker** | General-purpose code worker | read, write, edit, bash, fffind, ffgrep, web search, subagent lifecycle | ✅ Can spawn `scout` and `researcher` |
| **scout** | Fast codebase reconnaissance | read, ffgrep, fffind, ls | ❌ Cannot spawn children |
| **researcher** | Web research & synthesis | searxng\_web\_search, searxng\_search\_suggestions, searxng\_instance\_info, web\_url\_read | ❌ Cannot spawn children |

The worker is the primary subagent type. It follows the **scout to find, read to edit, researcher to investigate** workflow — delegating exploration to cheap, focused child agents before performing edits itself.

---

## How it works

1. The main agent (or a worker subagent) calls `spawn_subagent` with a type and task.
2. The extension loads the corresponding config (`.md` file with YAML frontmatter), resolves the model, and starts an independent LLM conversation in the background.
3. The subagent runs autonomously with its own tool set, permission profile, and context window.
4. The main agent polls progress with `query_subagent` (optionally blocking with `wait: true`) or terminates it with `kill_subagent`.
5. Completed subagents are auto-cleaned up after 60 seconds.

### Architecture

```
┌─────────────────────────────────────────────┐
│               Main Agent                     │
│  (full model, full tools, TUI)              │
│                                              │
│  spawn_subagent("worker", task) ──────────┐  │
│  query_subagent(id, wait: true) ◄─────────│──┤
└─────────────────────────────────────────────┘
                                            │
                    ┌───────────────────────▼───────────┐
                    │    worker subagent                 │
                    │    (deepseek-v4-flash, subagent    │
                    │     permission profile)            │
                    │                                    │
                    │  spawn_subagent("scout", q) ──┐    │
                    │  spawn_subagent("researcher",  │    │
                    │    q) ─────────────────────┐   │    │
                    │  query_subagent(...) ◄─────│───│────│─┐
                    │                            │   │    │ │
                    └────────────────────────────┼───┼────┘ │
                                                 │   │      │
                    ┌────────────────────────────▼───┘      │
                    │    scout subagent                     │
                    │    (read, grep, find, ls only)        │
                    │                                       │
                    └───────────────────────────────────────┘
                                                 │
                    ┌────────────────────────────┘
                    ▼
                    researcher subagent
                    (web search tools only)
```

---

## Tools Registered

The extension adds three tools to the main agent's toolbelt:

### `spawn_subagent`

Spawn a background sub-agent to work on a task independently.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `string` | Subagent type name (matches a config file name, e.g. `"worker"`, `"scout"`, `"researcher"`) |
| `task` | `string` | The task/prompt for the subagent to complete. Be specific about what you need. |

### `query_subagent`

Query the status and output of sub-agents.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | `string?` | — | Subagent ID to query. Omit or use `"all"` to list all sub-agents. |
| `wait` | `boolean?` | `false` | If `true`, block until the subagent completes before returning. Only applies when querying a specific sub-agent by ID. Has a 5-minute timeout. |

### `kill_subagent`

Terminate a running sub-agent by its ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Subagent ID to terminate. |

---

## Configuration

### Config file format

Each subagent type is defined by a `.md` file in `config/` with YAML frontmatter. The filename (without `.md`) becomes the type name used in `spawn_subagent`.

```markdown
---
name: worker
description: General-purpose worker — reads, writes, and edits code
tools: read, write, edit, bash, fffind, ffgrep, searxng_web_search, web_url_read, spawn_subagent, query_subagent, kill_subagent
permission: subagent
subagents: scout, researcher
model: deepseek/deepseek-v4-flash
thinking: medium
---

You are a worker agent. You operate in an isolated context...
```

### Frontmatter fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | type name | Display name for the subagent |
| `description` | `string` | — | Human-readable description shown in tooltips and listings |
| `tools` | `string` (comma-sep) | all tools | Comma-separated list of allowed tool names. Tools not in this list are never presented to the subagent's LLM. |
| `permission` | `string` | `"subagent"` | Toolgate permission profile name (e.g. `"subagent"`, `"default"`). Controls what filesystem operations, bash commands, etc. are allowed. |
| `subagents` | `string` (comma-sep) | none | Comma-separated child subagent types this agent may recursively spawn. When absent/empty, the subagent cannot spawn children. |
| `model` | `string` | parent's model | Model override in `"provider/modelId"` format (e.g. `"deepseek/deepseek-v4-flash"`). Inherits the parent agent's model when absent. |
| `thinking` | `string` | system default | Thinking level: `"low"`, `"medium"`, or `"high"`. |

### Body content

Everything after the frontmatter is the subagent's **system prompt** — it shapes the agent's personality, workflow, output format, and guidelines. Each built-in config ships with detailed instructions specific to the agent's role.

### Available tools (for the `tools` field)

**Built-in file/bash tools:**
- `read` — Read file contents
- `write` — Write content to a file
- `edit` — Edit a file with targeted replacements
- `bash` — Execute bash commands
- `ls` — List directory contents

**Search tools:**
- `fffind` — Fuzzy path search and glob matching
- `ffgrep` — Grep file contents with smart-case

**Web search tools (SearXNG):**
- `searxng_web_search` — Web search with optional filtering (time range, language, etc.)
- `searxng_search_suggestions` — Autocomplete suggestions
- `searxng_instance_info` — Discover SearXNG instance capabilities
- `web_url_read` — Fetch a URL and extract content as markdown

**Subagent lifecycle tools (recursive spawning):**
- `spawn_subagent` — Spawn a child subagent
- `query_subagent` — Query child subagent status
- `kill_subagent` — Terminate a child subagent

---

## Recursive spawning

The worker config includes `subagents: scout, researcher`, which means a worker can spawn scout and researcher children. Those children have no `subagents` field, so the maximum nesting depth is 2 (worker → scout/researcher).

To add deeper nesting, add a `subagents` field to the child config file with the allowed types.

### Permission model for recursive spawning

When a subagent tries to spawn a child, the extension checks:
1. The parent's config has a `subagents` field containing the requested type.
2. The child's config exists and is valid.

---

## Permission model

All subagent tool calls go through Pi's **toolgate** extension. The `permission` field in the config selects which toolgate profile applies. The default is `"subagent"`, a restricted profile appropriate for background agents.

When a tool call requires user confirmation (`ask` state), the extension shows a confirmation dialog in the main agent's UI. The user can approve, deny, or deny with a reason.

---

## TUI Widget

When subagents are active, the extension renders a live status widget above the editor in Pi's TUI:

```
── Subagents (3) ─────────────────────────────────
 ⏳ worker:a1b2c3d  running   12s  ↑1.2k↓3.4k  exploring src/components
   └─ ✓ scout:e5f6g7  done       3s  ↑0.5k↓0.8k  Found 5 files
   └─ ⏳ researcher:h8i9j0  running    8s  ↑0.4k↓1.2k  Searching for React 19 docs
```

Status indicators:
- ⏳ running
- ✓ completed
- ✗ error
- ⊘ killed

The widget auto-refreshes every 80ms while subagents are running, and auto-hides 30 seconds after all subagents complete.

---

## Best practices

### When to use a scout vs. read directly

**Dispatch a scout when:**
- The task names a feature/area but not specific files ("fix the auth flow")
- You'd need to grep + read 5+ files just to orient
- You only need to know *where* something lives or *what shape* it has

**Read directly when:**
- The task gives you explicit file paths
- You already know the file you need to edit
- You need the exact bytes for an edit call

### When to use a researcher vs. web fetch directly

**Dispatch a researcher when:**
- The question is open-ended ("what's the idiomatic way to X in library Y")
- You'd need to search + read 3+ pages to triangulate an answer

**Fetch directly when:**
- You already have the exact URL
- You need a single specific piece of information from one page

### Parallelism

If you need two independent investigations (e.g. "map the auth code" AND "look up the library's session API"), emit multiple `spawn_subagent` calls in the same turn — they run concurrently.

### Context protection

Subagents cannot edit files for the main agent. The main agent still performs the actual `edit`/`write` calls, using the focused context the scouts provided. Treat subagents as a **context-protecting prefetch**, not a substitute for thinking.

---

## File structure

```
extensions/subagent/
├── README.md              ← this file
├── index.ts               ← Extension entry point, tool registration
├── types.ts               ← Shared type definitions
├── config-loader.ts       ← YAML frontmatter parsing & config loading
├── subagent-runner.ts     ← Core execution loop (LLM + tool loop)
├── tool-executor.ts       ← Tool creation, filtering, and execution
├── renderer.ts            ← TUI widget rendering
└── config/
    ├── worker.md          ← Worker subagent config
    ├── scout.md           ← Scout subagent config
    └── researcher.md      ← Researcher subagent config
```

---

## Development

The extension depends on these Pi SDK packages:

- `@earendil-works/pi-coding-agent` — Extension API (tool registration, UI, frontmatter parsing, tool factories)
- `@earendil-works/pi-ai` — AI provider abstractions (Model, Context, streaming)
- `@earendil-works/pi-ai/compat` — Static provider loader for `streamSimple`
- `typebox` — Runtime type validation for tool parameters
- `../toolgate` — Sibling extension for permission gating
- `../websearch` — Sibling extension for SearXNG MCP tools

### Adding a new subagent type

1. Create a new `.md` file in `config/` with YAML frontmatter and system prompt body.
2. If it should be spawnable from the main agent, it's available immediately.
3. If it should only be spawnable by another subagent, add its type name to the parent's `subagents` field.

### Adding new tools

Extend `tool-executor.ts` by registering additional tool instances in the factory function. Tools follow Pi's built-in tool interface (`name`, `description`, `parameters`, `execute`).

---

## License

Part of the Pi coding agent project.
