# nvim-dotfiles
Neovim Configuration for Python

## Installation

该配置使用 Neovim + Zellij + Reasonix / Pi / Claude Code 提供完整的 python 编辑体验。安装脚本 `install.sh` 可实现一键安装。

### 常用命令

```bash
./install.sh                                          # 仅复制 nvim 配置
./install.sh --clean                                  # 清理后复制 nvim 配置
./install.sh --install-dependencies ~/tools            # 安装所有依赖（nvim + 工具 + agent）
./install.sh --clean --install-dependencies ~/tools   # 全量安装
./install.sh --agent-only                             # 仅复制所有 agent 配置
./install.sh --agent-only --agents pi                 # 仅复制 pi 配置
./install.sh --install-dependencies ~/tools --agents pi,claude  # 仅安装 pi + claude
```

### 选项说明

| 选项 | 说明 |
|------|------|
| `--clean` | 清理旧的 nvim 配置和缓存后重新复制 |
| `--install-dependencies <path>` | 下载并安装所有依赖到指定目录 |
| `--skip-python` | 跳过 Python 包安装 |
| `--agent-only` | 仅复制 agent 框架配置，不处理 nvim/zellij |
| `--agents <list>` | 指定要安装/配置的 agent，逗号分隔。可用值: `pi`, `claude`, `reasonix` |

## Key Mapping
| 映射 Keymap | 功能 Function | 相关插件 Plugins |
| --- | --- | --- |
| ctrl + p | 文件名查找 | telescope |
| space + f | 文件名查找 | telescope |
| space + o | 触发代码大纲 | outline |
| space + s | 单文件符号查找（symbol） | telescope + aerial |
| space + d | 打开诊断汇总窗口 | blink-cmp + telescope |
| space + e | 打开文件浏览器 | telescope-file-browser |
| space + b | 显示/隐藏文件树 | nvim-tree |
| space + t | 打开内置终端 | toggleterm |
| ctrl + \ | 打开/隐藏内置终端（作为 agent panel 使用） | toggleterm |
| space + g | 打开 lazygit | lazygit |
| space + p | 预览 git 编辑变化 | gitsigns |
| space + r | 将该 chunk 恢复到上一次 commit | gitsigns |
| space + space | 运行当前单元格 | quench |
| space + enter | 运行并跳转下一单元格 | quench |
| space + c | 注释 | mini.comment |
| c, d, r | 创建（create）/删除（delete）/重命名（rename）文件 | telescope-file-browser |
| tab | 最近窗口轮换 | telescope |
| space + tab | 窗口轮换（i/n模式均可） | 原生 |
| shift + left / right | 向左/向右以词为单位移动（i/n模式均可） | 原生 |
| option + up / down | 移动到最上/最下（i模式） | 原生 |
| shift + backspace | 以词为单位删除（i模式） | 原生 |
| ctrl + h / j / k / l | 上下左右移动光标（i模式） | 原生 |
| ctrl + h / l | 向左/向右轮换 buffer | barbar |
| space + w | 关闭 buffer | barbar |
| gd / gi / gr | 跳转到定义/实现/引用（def/impl/ref）| 原生 |
| spcae + gd / gi / gr | 跳转预览 | preview |
| ctrl + o / i | 跳转到上一次/下一次光标所在位置（old/into） | 原生 |
| 鼠标拖拉 | 调整窗口大小 | 原生 |
| ctrl + t | 向前缩进（i 模式） | 原生 |
| ctrl + d | 向后缩进（i 模式） | 原生 |
| (n+)> | 向前缩进（n 次）（v 模式） | 原生 |
| (n+)< | 向后缩进（n 次）（v 模式） | 原生 |
| ]d | 跳转到下一个诊断 | blink-cmp |
| [d | 跳转到上一个诊断 | blink-cmp |
| ctrl + y | 取消补全提示 | blink-cmp |

## Usage

### Interactive Python
Jupytext 相关的功能由 Quench.nvim 提供；端口号为 18237。需要一个额外的浏览器窗口提供支持。

### LSP
使用 `:Mason` 查找并使用 `i` 键安装对应语言的 LSP。然后在 LSP 相关的配置文件中启用即可。

Mason 是 LSP 的包管理系统，lspconfig 是 LSP 向 neovim 的接口系统。mason-lspconfig 是两者的桥梁，负责将 Mason 安装的 LSP 提供给 lspconfig 进行发现。

treesitter 完成的是 AST 的解析，提供语言相关的语法高亮和格式化。blink-cmp 从 LSP 获得信息进行补全提示。

针对 python 配置，使用 ty 作为 lsp 和语法检查器。不推荐使用其他 lsp。默认启用的 lsp 为 `ty` 和 `rust_analyzer`。lsp 会自动检测终端中的 python 环境。

### Terminal
现代终端均可，没有过多的要求。`wezterm` 和 `kitty` 均是可用的。`wezterm` 的 config 也位于该仓库中，拷贝至客户端的 `~/.config/wezterm` 即可。

### Agentic Coding
支持三个 agent 框架，均使用 DeepSeek V4 Flash/Pro 作为后端：

| Agent | 安装方式 | 配置位置 |
|-------|----------|----------|
| **Pi** | `curl -fsSL https://pi.dev/install.sh \| sh` | `pi/` → `~/.pi/agent/` |
| **Claude Code** | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude/settings.json` → `~/.claude/` |
| **Reasonix** | 下载二进制 tarball | `reasonix/config.toml` → `~/.config/reasonix/` |

Pi 配置包含以下自定义内容：
- **Provider / Model 定义**：DeepSeek V4 Pro / Flash（`models.json`）
- **Extension**：websearch（SearXNG 搜索集成）、plan-mode（计划模式）、token-detail（Token 用量）
- **第三方 Package**：permission-system、subagents、btw、fff、wtf、tool-display、powerline-footer
- **系统提示词**：`APPEND_SYSTEM.md`

第三方 Package 由 Pi 的 package 系统根据 `settings.json` 自动安装，其代码不纳入本仓库。仅 `pi-permission-system` 的用户配置文件纳入。

在 Neovim 中使用 `ctrl + \` 打开 ToggleTerm 作为 agent panel，可运行任意 agent 框架。

### Others
主题可以通过`:Telescope colorscheme`进行选择。但是想要永久生效，必须通过`colorscheme.lua`进行配置。

