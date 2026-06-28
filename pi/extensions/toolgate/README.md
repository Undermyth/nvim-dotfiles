# 🔐 toolgate — Tool Permission Gate for Pi

**toolgate** 是 Pi coding agent 的一个权限门控扩展。它拦截每一次 `tool_call` 事件，根据 `config.json` 中定义的基于 profile 的权限规则对工具调用进行安全检查，并决定是 **allow**（放行）、**ask**（询问用户）还是 **deny**（阻止）。

## 特性

- **多 Profile 配置** — 支持为不同场景定义独立的权限 profile（如 `"subagent"`、`"default"`），profile 名称通过环境变量 `PI_TOOLGATE_PROFILE` 指定
- **细粒度 Bash 命令过滤** — 支持 glob 风格的命令模式匹配（`"rm *"`、`"git push --force *"`），精确到单个命令
- **路径启发式** — 自动检测 bash 命令中是否访问了当前工作目录（CWD）之外的文件路径，若检测到则将 `allow` 自动升级为 `ask`
- **三种权限状态**：`allow`（放行）、`deny`（阻止，带原因）、`ask`（询问用户，带三层选择：批准 / 直接拒绝 / 输入理由拒绝）
- **YOLO 模式** — 通过 `/yolo` 命令一键切换，放行所有非 bash 工具，适合快速开发迭代
- **子进程 IPC 中继** — 当工具调用发生在 subagent 子进程中时，`ask` 决策通过 stdout/stdin JSON IPC 传递回父进程（可递归传递，直到到达拥有真实 TUI 的根进程）
- **公共 Service API** — 通过 `Symbol.for("@toolgate:service")` 发布在 `globalThis` 上，供其他扩展调用
- **确认队列** — 串行化确认对话框，防止 tool_call 事件和 subagent `onAsk` 回调互相覆盖
- **失败关闭** — 发生未预期错误时默认阻止工具调用，确保安全

## 安装

toolgate 是 Pi 的内置扩展，位于：

```
~/.pi/agent/extensions/toolgate/
```

在 `~/.pi/config.json` 中启用：

```json
{
  "extensions": {
    "toolgate": {
      "enabled": true,
      "location": "~/.pi/agent/extensions/toolgate"
    }
  }
}
```

## 配置文件

配置文件位于 `~/.pi/agent/extensions/toolgate/config.json`。支持定义多个 profile，每个 profile 包含通配默认值 `"*"` 以及各工具（`read`、`write`、`edit`、`bash`、`ls` 等）的权限规则。

### 示例

```json
{
  "default": {
    "*": "ask",
    "read": "allow",
    "write": "ask",
    "edit": "ask",
    "ls": "allow",
    "fffind": "allow",
    "ffgrep": "allow",
    "web_url_read": "allow",
    "searxng_web_search": "allow",
    "searxng_search_suggestions": "allow",
    "searxng_instance_info": "allow",
    "bash": {
      "*": "allow",
      "rm *": "ask",
      "rmdir *": "ask",
      "del *": "ask",
      "mv *": "ask",
      "sudo *": "deny",
      "su *": "deny",
      "chmod 777 *": "deny",
      "curl * | sh": "deny",
      "curl * | bash": "deny",
      "wget * -O - | sh": "deny",
      "git push --force *": "deny",
      "git push -f *": "deny",
      "npm publish *": "ask",
      "pip install *": "ask"
    }
  },
  "subagent": {
    "*": "ask",
    "read": "allow",
    "write": "ask",
    "edit": "ask",
    "bash": {
      "*": "allow",
      "rm *": "ask",
      "sudo *": "deny"
    }
  }
}
```

### 规则优先级

1. **工具级精确匹配**（如 `"write": "allow"`）优先于通配符 `"*"`
2. **Bash 命令模式匹配**按**最后匹配获胜**（last-match-wins）：后定义的模式优先级更高，覆盖前面的模式
3. **路径启发式**：若 bash 命令操作 CWD 之外的路径，`allow` 升级为 `ask`
4. `deny` 永远是终止状态，不会被任何启发式降级

### Bash 命令模式语法

| 模式 | 说明 | 匹配示例 |
|------|------|----------|
| `"*"` | 通配默认值 | 所有命令 |
| `"rm *"` | 以 `rm` 开头的命令（含参数） | `rm -rf /tmp`、`rm file.txt` |
| `"git push --force *"` | 特定 git 操作 | `git push --force origin main` |
| `"sudo *"` | 所有 sudo 命令 | `sudo rm -rf /` |

模式中的 `*` 匹配任意字符（贪婪），`?` 匹配单个字符。末尾的 ` *` 自动转为可选，所以 `"rm *"` 同时匹配 `rm` 和 `rm -rf /`。

## 交互式确认对话框

当规则判定为 `ask` 时，toolgate 会显示一个三层确认对话框：

| 按键 | 动作 |
|------|------|
| `y` | **批准** — 允许该工具调用 |
| `n` | **拒绝** — 直接阻止，不提供原因 |
| `r` | **拒绝并输入原因** — 阻止调用，并输入一段文字说明理由（理由会作为 block 的 reason 返回给 AI） |
| `Esc` | 返回 / 取消 |

拒绝的原因会以 `User denied: <reason>` 的形式返回给 AI，使其能理解被拒绝的原因并调整行为。

## YOLO 模式

在聊天中发送 `/yolo` 命令即可切换 YOLO 模式：

- **ON** — 所有非 bash 工具自动放行（read、write、edit、web 搜索等不再弹确认）
- **OFF** — 恢复正常权限检查

状态栏会显示 `⚠ YOLO` 标记。适合在需要快速迭代时使用。

## 子进程 IPC 中继

当 subagent 子进程中触发了 `ask` 决策：

1. toolgate 检测到环境变量 `PI_TOOLGATE_PROFILE` 被设置
2. 它不尝试显示 UI 对话框，而是向 `stdout` 写入一行 JSON：
   ```json
   {"type":"toolgate_ask","requestId":"...","toolName":"write","title":"Write file","message":"..."}
   ```
3. 父进程的 toolgate 扩展（或更上层的进程）接收到这一行，在 TUI 中显示确认对话框
4. 用户做出选择后，父进程向子进程的 `stdin` 回复：
   ```json
   {"type":"toolgate_ask_response","requestId":"...","approved":false,"reason":"Don't overwrite config"}
   ```
5. 子进程根据回复放行或阻止该工具调用

支持多层嵌套：如果父进程本身也是 subagent，它会继续向上中继，直到到达拥有真实 TUI 的根 Pi 进程。

## Service API

其他扩展可通过全局 Symbol 访问 ToolgateService：

```typescript
const TOOLGATE = Symbol.for("@toolgate:service");
const svc = (globalThis as any)[TOOLGATE] as ToolgateService;

// 检查一个工具调用是否被允许
const result = svc.check("bash", { command: "rm -rf /tmp" });
// → { state: "ask", reason: "...", promptTitle: "...", promptMessage: "..." }

// 查询工具级默认状态
const state = svc.getToolState("write");
// → "allow" | "ask" | "deny"

// 重新加载配置
svc.reload();

// 检查 profile 是否存在
svc.hasProfile("subagent"); // → boolean

// 列出所有 profile
svc.listProfiles(); // → string[]
```

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        config.json                                 │
│                     (多 profile 权限配置)                            │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────────┐
│                          config.ts                                 │
│              加载 / 验证 / 缓存 / 自动创建默认配置                   │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────────┐
│                          gate.ts                                   │
│             核心评估引擎：根据 profile 判断 allow / ask / deny        │
└──┬───────────────────────┬───────────────────────┬─────────────────┘
   │                       │                       │
   ▼                       ▼                       ▼
┌──────────┐     ┌───────────────┐     ┌──────────────────────┐
│ 简单工具  │     │   Bash 命令   │     │  文件访问工具         │
│ 直接查表  │     │  模式匹配      │     │  路径启发式           │
└──────────┘     └───────┬───────┘     └──────────┬───────────┘
                         │                        │
               ┌─────────▼─────────┐   ┌─────────▼─────────┐
               │    matcher.ts     │   │  bash-check.ts    │
               │ 通配符→正则编译    │   │  CWD 路径检测      │
               └─────────┬─────────┘   └─────────┬─────────┘
                         │                        │
┌────────────────────────▼────────────────────────▼─────────────────┐
│                          index.ts                                 │
│  主入口：注册 tool_call 监听、/yolo 命令、profile 解析、最终决策    │
└──┬───────────────────────┬───────────────────────┬─────────────────┘
   │                       │                       │
   ▼                       ▼                       ▼
┌──────────┐     ┌───────────────┐     ┌──────────────────────┐
│ 允许放行  │     │  弹出确认      │     │  拒绝 + 返回原因     │
└──────────┘     └───────┬───────┘     └──────────────────────┘
                         │
               ┌─────────▼──────────────────────────┐
               │      confirm-dialog.ts             │
               │  三层确认：y 批准 / n 拒绝 / r 拒    │
               │  绝并输入理由                        │
               └────────────────────────────────────┘
               ┌─────────▼──────────────────────────┐
               │      ask-relay.ts                  │
               │  子进程 IPC：stdout 发送请求 →       │
               │  stdin 接收父进程的决策               │
               └────────────────────────────────────┘
```

### 文件说明

| 文件 | 职责 |
|------|------|
| `index.ts` | 扩展入口，注册事件监听器（`session_start`、`session_shutdown`、`tool_call`）和 `/yolo` 命令 |
| `gate.ts` | 核心评估引擎。根据 tool 名称和 input 解析权限状态，区分 Bash 命令、文件访问工具和通用工具 |
| `config.ts` | 配置加载、解析、验证和缓存。自动在 `~/.pi/agent/extensions/toolgate/` 下创建默认配置 |
| `matcher.ts` | 将 glob 风格通配符模式（如 `"rm *"`）编译为正则表达式，支持 bash 命令匹配 |
| `bash-check.ts` | 路径启发式分析。从 bash 命令中提取路径 token，检测是否访问 CWD 之外的路径 |
| `confirm-dialog.ts` | 三层确认对话框组件（批准 / 拒绝 / 拒绝并输入理由），非 overlay 全宽渲染 |
| `ask-relay.ts` | 子进程 IPC 中继。通过 stdout/stdin 的 JSON 行通信，支持多层嵌套 relay |
| `service.ts` | 公共 Service API，通过 `globalThis` Symbol 发布，供其他扩展和 subagent 使用 |
| `config.json` | 默认权限配置，包含 `default` 和 `subagent` 两个 profile |

## 安全设计

- **失败关闭** — 任何未预期的异常（JSON 解析失败、文件读取错误、代码抛异常）都会阻止工具调用，宁可不放行不可错放
- **路径启发式只升级、不降级** — `allow → ask`、`ask → ask`、`deny → deny`，`deny` 永远保持
- **deny 最高优先级** — 任何规则只要明确禁止，不会被任何启发式覆盖
- **确认队列** — 多确认请求串行处理，防止竞态和对话框覆盖
- **子进程超时** — subagent 的 ask 请求 60 秒超时后自动拒绝，防止子进程永久挂起
