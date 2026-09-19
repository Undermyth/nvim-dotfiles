# Neovim 配置审计报告

- 审计对象：`nvim-dotfiles/nvim`（`~/.config/nvim` 软链接到此目录）
- 运行环境：Neovim **v0.12.4**（spack 安装），LuaJIT 2.1
- 审计日期：2026-09-18
- 方法：静态阅读全部 31 个 plugin spec + 13 个 config 模块；用 headless Neovim 加载真实配置做运行时取证（keymap 归属、选项生效值、`checkhealth`、插件源码核对）；对插件 latest API 做网络核对。
- 结论标记：`[已复现]` = 在本机实测确认；`[已核对源码]` = 对照插件/neovim 运行时源码确认；`[待确认]` = 需你判断设计意图。

---

## 结论概览（先看这里）

配置整体是**健康的**：目录分层清楚、lazy-lock 锁版本、treesitter main 分支的新 API 已经迁移到位、插件替代品（ty/ruff、render-latex、origami）也跟上了上游。没有发现「配置根本跑不起来」级别的问题——加载真实配置无任何报错。

但存在 **11 个确定性 Bug**（其中 5 个会静默失效、2 个会让内建功能退化），以及一批**典型的配置腐化**：写了却不生效的配置项、被后加载插件覆盖的映射、同一功能装了两套插件、README 与代码脱节。

针对你提的两个角度：

- **组织性（§1 P1 表 + §2）**：最值得做的不是"改风格"，而是**消除不生效的配置**——`opts` 死代码、被覆盖的映射、被遮蔽的键位、被清空的 `defer_save`。这些东西会让人对配置产生错误的心智模型。其次是统一命名/缩进/加 `desc`，并引入 `stylua` 把它固化。
- **功能性（§1 P2 表 + §4）**：收益最大的三件事是 ①`undofile`（跨 session 撤销，当前关闭）；②`ty` 不支持格式化，需要补 `ruff` + format on save（当前完全没有格式化入口）；③`winborder` + `scrolloff` + `signcolumn` 这几个"一处生效、立竿见影"的显示选项。

**特别值得注意的"看似在用、其实没生效"清单**（建议优先处理）：

| 看起来是 | 实际是 | 位置 |
|---|---|---|
| `<leader>u` 打开 git status | 不调用任何命令 | `config/telescope.lua:21` |
| `<M-Left>` 按词左移 | 执行了拼错的 `:vetical`（报错） | `keymap.lua:32` |
| CursorHold 高亮当前符号 | 用过一次 `v` 后永久失效 | `options.lua:87` |
| `text_object = '<leader>c'` | 被忽略；还顺带弄坏了内建 `x gc` | `config/mini-comment.lua:12` |
| LSP 浮窗圆角（`opts.ui`/`opts.diagnostics`） | 从未被应用（死代码） | `plugins/nvim-lspconfig.lua:8-21` |
| `debounce_delay = 300` 防抖保存 | `defer_save = {}` 使其成为死配置 | `plugins/auto-save.nvim.lua:7-12` |
| `<leader>o` 打开 outline | 打开的是 aerial | `config/aerial.lua` vs `plugins/outline.nvim.lua` |
| `i <S-Tab>` 切窗口 | 被 neotab 覆盖 | `keymap.lua:22` |
| `]d` 跳到下一个 conditional | 是诊断跳转（且 API 已弃用） | `config/treesitter-textobj.lua:44` |
| `.tex` 有 treesitter 高亮 | filetype 名写错，高亮从未启动 | `config/treesitter.lua:28` |
| `<C-4>` 跳到行尾并插入 | 只做了左移缩进，不会进入插入模式 | `keymap.lua:13` |

---

## 0. 摘要（按优先级）

### P0 — 明确的 Bug（会导致功能错误或不符合预期）

| # | 位置 | 问题 | 证据 |
|---|---|---|---|
| P0-1 | `lua/config/telescope.lua:21` | `<leader>u` 的 rhs 写成 `"Telescope git_status<CR>"`，**缺少前导 `:`**，不会调用命令 | `[已复现]` 带 `:` 的版本能进入 telescope command handler，不带则完全不动 |
| P0-2 | `lua/keymap.lua:32` | `:vetical resize -2<CR>` 拼写错误（应为 `vertical`），且**覆盖了**第 19 行 `<M-Left> = "b"` | `[已复现]` `E492: Not an editor command: vetical resize -2` |
| P0-3 | `lua/options.lua:87` | `visualmode() == ""` 被当作「当前不在可视模式」。`visualmode()` 返回的是**上次**用过的可视模式；一旦用过一次 `v`，此后整个 session 的 CursorHold 高亮永久失效 | `[已复现]` 一次 `v` 后 `visualmode()` 变成 `"v"` 不再回空 |
| P0-4 | `lua/config/mini-comment.lua:12` | 选项名写错：mini.comment 的 key 是 `textobject`（无下划线），`text_object` 被静默忽略。**副作用**：导致 mini.comment 把内建的可视模式 `gc`（注释选区）也劫持成 "Comment textobject" | `[已核对源码]` `mini/comment.lua:424,448`；`[已复现]` `x gc` → `MiniComment.textobject()`，选区未被注释 |
| P0-5 | `lua/plugins/nvim-lspconfig.lua:8-21` | `opts = { ui=..., diagnostics=... }` 是**死代码**：lazy.nvim 在同时存在 `config` 函数时只调用 `config(plugin, opts)`，**不会**调用 `setup(opts)` | `[已核对源码]` `lazy.nvim/lua/lazy/core/loader.lua:375-392` |
| P0-6 | `lua/lsp.lua:3-13` | `LspAttach` 里设 keymap 却没带 `buffer = args.buf`，实际是**全局映射**；且被 `goto-preview` 全量覆盖 | `[已复现]` `maparg("gd","n").buffer == 0` |
| P0-7 | `lua/keymap.lua:22` | `i <S-Tab> = <Esc><C-w>w` 被 neotab（`InsertEnter` 时注册的全局映射）覆盖，是死映射 | `[已核对源码]` neotab 用 `nvim_set_keymap("i", reverse_key, ...)` 全局注册，晚于 startup 执行 |
| P0-8 | `lua/config/treesitter-textobj.lua:44-45` | `]d` / `[d` 的 conditional 跳转被 `lua/lsp.lua:18-19` 的诊断跳转覆盖，从未生效 | `[已复现]` 运行时 `]d` 是 lsp.lua 的 callback |
| P0-9 | `lua/config/treesitter.lua:28` | `auto_start` 里写 `"latex"`，但 Neovim 的 LaTeX filetype 是 **`tex`**（`plaintex`/`tex`），不存在 `latex` filetype → `.tex` 文件的语法高亮**从未启动** | `[已复现]` 探针：`tex` buffer `treesitter active = false`，`python` buffer `= true`；`runtime/ftplugin/tex.vim` 头注释 `Language: LaTeX (ft=tex)` |
| P0-10 | `lua/keymap.lua:13` | `i <C-4> = "<Esc><$>a"`：`<$` 是「左移当前行」操作符，其后的 `>` 使 `a` 变成无效 motion，**不会进入插入模式**，`a` 完全失效 | `[已复现]` 缩进行实测：`<$>a` 只把 8 空格变 4 空格，mode 仍为 `n` |
| P0-11 | `lua/lsp.lua:11` + `lua/config/preview.lua:9` | `gi` 被映射成「LSP implementation / preview implementation」，**遮蔽了 Vim 原生 `gi`**（回到上次退出插入模式的位置继续插入），这是很常用的原生命令 | `[已核对源码]` `runtime/lua/vim/_core/defaults.lua` 无 `gi` 默认映射，`gi` 是 C 层原生命令；`[已复现]` 运行时 `gi` → goto-preview |

#### P0 修复状态（2026-09，已全部修复并实测通过）

> 状态标注仅记录「结论 + 落点」，原始证据与推理保持不变。
> 共 43 项运行时断言 + 行为探针全部通过，`nvim --headless -u init.lua -c 'qa!'` 无报错、无 deprecation 警告。

| # | 状态 | 落点 |
|---|---|---|
| P0-1 | ✅ 已修 | `lua/config/telescope.lua:21` → `"<cmd>Telescope git_status<CR>"` |
| P0-2 | ✅ 已修 | `lua/keymap.lua` 删除 4 条 `<M-Arrow>` resize（原 30-33，含拼写错误的 `vetical`）；`<M-Left>`/`<M-Right>` 词移动不再被覆盖；保留 `<C-Arrow>` 4 条 resize |
| P0-3 | ✅ 已修 | `lua/options.lua` CursorHold 守卫改为仅 `vim.fn.mode() == "n"`；同时启用 `vim.o.winborder = "rounded"` |
| P0-4 | ✅ 已修 | `lua/config/mini-comment.lua:12` → `textobject`；`textobject == comment_visual` 使 textobject 仅注册于 `o` 模式，内建可视 `gc` 解劫持（实测 `Vjgc` 恢复注释） |
| P0-5 | ✅ 已修 | `lua/plugins/nvim-lspconfig.lua` 删除死 `opts`；圆角边框改为全局 `vim.o.winborder`；v1 `lspconfig.<name>.setup` 注释改为 `vim.lsp.config` |
| P0-6 | ✅ 已修 | `lua/lsp.lua` 的 `LspAttach` 改用 `buffer = args.buf`，并合并 `preview.lua` 的重复全局映射（后者已删除）。实测真实 `ty` 服务器 attach 后 `gd`/`gr`/`ge` 为 buffer-local，非 LSP buffer 中不存在。**注**：原 `gt`（preview type definition）随重复定义一并移除 |
| P0-7 | ✅ 已修 | `lua/keymap.lua` 删除 `i <S-Tab>`（由 neotab 的 `InsertEnter` 全局映射接管） |
| P0-8 | ✅ 已修 | `lua/config/treesitter-textobj.lua` 的 conditional 跳转改绑 `]c`/`[c`（实测空闲）；`lua/lsp.lua` 删除 deprecated 的 `]d`/`[d`，交还 Neovim 0.12 内建诊断跳转（同时消除 P1-1） |
| P0-9 | ✅ 已修 | `lua/config/treesitter.lua` 改为按 `parsers` 动态推导 filetypes + 显式 `register("latex", "tex"/"plaintex")`；实测 `.tex`（`ft=plaintex`）与 `ft=latex` 高亮均已启动 |
| P0-10 | ✅ 已修 | `lua/keymap.lua` 删除 `i <C-4>` 与 `i <C-6>`（按维护者决定：两条都删；审计原文认为 `<C-6>` 本身正确，此处是主动取舍而非修 bug） |
| P0-11 | ✅ 已修 | `lua/lsp.lua` 删除 `gi` 映射并把 implementation 动作绑到 `ge`（buffer-local）；`lua/config/preview.lua` 不再定义 `gi`。`ge` 无现有映射冲突，代价是占掉原生 `ge`（上一个词尾） |

#### P0 修复引入的行为变化（需知悉）

- `<M-Left>` / `<M-Right>` 恢复为词移动（`b` / `E`）；`<M-Up>` / `<M-Down>` 归还原生行为。resize 仅由 `<C-Arrow>` 提供。
- `gd` / `gr` / `ge` 由「全局可用」变为「仅 LSP attach 的 buffer 可用」；`gt`（type definition）不再映射。
- `ge` 占用原生「上一个词尾」动作（`dge` / `yge` / `cge` 随之失效），换取 `gi` 归还原生。
- 内建 `gcc` / 可视 `gc` 与 mini.comment 的 `<leader>c` 并存（`n`/`x`/`o` 三态 `<leader>c` 均由 mini.comment 提供）。

### P1 — 组织性 / legacy 风险

| # | 位置 | 问题 |
|---|---|---|
| P1-1 | `lua/lsp.lua:18-19` | `vim.diagnostic.goto_prev/goto_next` **已 deprecated（0.13 移除）**，应改用 `vim.diagnostic.jump()`；而 Neovim 0.12 已内建 `]d`/`[d`（`_core/defaults.lua:263`），所以这两行**既过时又多余**，可直接删除 |
| P1-2 | `lua/lazynvim.lua:4` | `vim.loop.fs_stat` → Neovim 0.10+ 已弃用，应用 `vim.uv` |
| P1-3 | `lua/plugins/noice.nvim.lua:15-19` | `cmp.entry.get_documentation` 是 nvim-cmp 专用的 hack（noice 用 `Hacks.on_module("cmp.entry", ...)`，nvim-cmp 不存在时永不触发），本项目用 blink.cmp，属死配置；`vim.lsp.util.stylize_markdown` 在 Neovim 0.12 已 deprecated |
| P1-4 | `lua/plugins/nvim-lspconfig.lua:25,35-64` | 注释里的 `lspconfig.<name>.setup({})` 是 v1 写法；`require('lspconfig')` 框架已被官方标记 deprecated（计划 v3.0.0 移除），`ty` 已不在 `lua/lspconfig/configs/` 中（只在 `lsp/ty.lua`） |
| P1-5 | `lua/plugins/nvim-treesitter.lua:5` | `branch = "main"` 已冗余（`main` 现在是默认分支，`master` 被冻结在 0.11） |
| P1-6 | `lua/plugins/catppuccin.nvim.lua` | 整个插件未被使用（`colorscheme.lua` 用的是 `night-owl`），但 `priority = 1000` 仍在启动时加载；且 `flavour = "latte"`（浅色）与实际主题矛盾 |
| P1-7 | `lua/config/aerial.lua` vs `lua/plugins/outline.nvim.lua` | 两个功能重复的 outline 插件，且都绑 `<leader>o`；aerial 先注册，**outline 的 `<leader>o` 永远不会触发**（`[已复现]` 运行时 `<leader>o` = `AerialToggle!`） |
| P1-8 | `lua/plugins/lazygit.nvim.lua:3-10` | `lazy = false` 与 `cmd = {...}` 语义矛盾（`lazy=false` 时 `cmd` 懒加载无意义），且强制开机加载 |
| P1-9 | `lua/config/nvim-tree.lua:7` + `lua/plugins/nvim-tree.lua:6-8` | `<leader>b` 重复定义两次 |
| P1-10 | 全仓库 | 代码风格不统一：2 空格 / 4 空格 / Tab 混用、单双引号混用、注释中英文混用、文件命名不统一（`tele-file-browser.nvim.lua`、`neotab.lua`）、`mini-comment` 用 `nvim-mini/*` 而 `mini-diff` 用 `echasnovski/*`；无 `.stylua.toml` / `.editorconfig` |
| P1-11 | `lua/keymap.lua:1-4`、`lua/colorscheme.lua:4` | 未使用的局部变量（`opts`、`catppuccin`） |
| P1-12 | `lua/plugins/gitsigns.nvim.lua`、`dropbar.nvim.lua`、`night-owl.nvim.lua`、`mini-diff.nvim.lua` | 用 `config = function() ... setup(...) end` 而非 `opts`，与其余 spec 风格不一致 |
| P1-13 | `README.md` | 严重过期：仍描述 `quench`（运行 cell）、`barbar`（buffer 轮换），二者已从配置中移除；`space+o` 写「outline」实际是 `AerialToggle!`；`gd/gi/gr` 写「原生」实际是 goto-preview |
| P1-14 | `install.sh:441,376` | 安装提示仍要求 `:UpdateRemotePlugins`（"quench.nvim 需要"），并安装 `jupyter-client / ipykernel` 等已不需要的 Python 包 |
| P1-15 | `~/.local/share/nvim/site/pack/core/opt` | 空目录残留，`checkhealth lazy` 报 warning「found existing packages」；`~/.cache/nvim/math-conceal.nvim` 也是已移除插件的缓存 |
| P1-16 | `lua/plugins/auto-save.nvim.lua:7-12` | `defer_save = {}` 关掉了全部防抖保存，导致 `debounce_delay = 300` 成为**死配置**；实际只在离开 buffer/失焦/退出时保存（详见 4.5） |

### P2 — 功能性完善建议（改善 coding 体验）

| # | 建议 | 收益 |
|---|---|---|
| P2-1 | `vim.opt.undofile = true`（+ `undodir`） | 跨 session 撤销，当前为 `false`，是最大的体验缺口之一 |
| P2-2 | `vim.o.winborder = "rounded"`（0.11+ 全局浮窗边框，配置里被注释掉了） | 一处生效，可删掉各插件里重复的 `border = "rounded"` |
| P2-3 | `vim.opt.scrolloff`（当前 `0`） | 光标不停留在屏幕最边缘 |
| P2-4 | `vim.opt.signcolumn = "yes"`（当前 `auto`） | 避免 git/diagnostic sign 出现时整屏横向抖动 |
| P2-5 | 补 Python 的格式化链路：`ty` **不支持 formatting**（官方说 "Use Ruff"），需要额外启用 `ruff` + format on save | 全仓库 `vim.lsp.buf.format` 出现 **0** 次，没有任何格式化入口 |
| P2-6 | 补 inlay hints toggle（0.12 新签名 `enable(bool, { bufnr = ... })`）；rename / code action / hover / `gq` 格式化都已是**内建**（`grn` / `gra` / `K` / `formatexpr`），无需再配 | `inlay_hint` 出现 **0** 次 |
| P2-7 | `ty` 目前不支持 `textDocument/implementation`，所以 `gi` / `gri` 在 Python 下**本身就是空操作**；且 `ty` 仍是 beta（0.0.x，无稳定 API） | 需要评估是否为 Python 补 `ruff`，或加 `pyright` 作为备选 |
| P2-8 | Neovim 0.12 已内建 `gc`/`gcc`/可视 `gc` 注释，`mini.comment` 变成可选；至少统一到一套（`gc` 系 + `<leader>c` 二选一） | 当前 `gc`（内建）与 `<leader>c`（mini.comment）重复，且 `x gc` 被劫持（P0-4） |
| P2-9 | blink.cmp：`signature = { enabled = true }` + `<C-k>`；`preset='none'` 导致 `<C-space>` / `<C-e>` / `<C-n>` / `<C-p>` 全部缺失 | 签名帮助默认关闭，当前配置也未开 |
| P2-10 | blink.cmp：`fuzzy.implementation` 用 `"prefer_rust_with_warning"` 替代 `"rust"` | `"rust"` 在无预编译二进制时会直接报错，无 Lua 兜底 |
| P2-11 | blink.cmp：`['<Enter>']` 用 `accept` 而非 `select_and_accept` | 后者在菜单打开但未选中时会接受第一项而非换行 |
| P2-12 | `vim.opt.timeoutlen` 调小（当前 1000ms） | `gr` 与内建 `grn/gra/grr/gri` 前缀歧义会产生 1s 等待 |
| P2-13 | `diagnostic`：`severity_sort = true`，重估 `update_in_insert = true` | 排序后更易读；insert 模式实时更新可能有性能开销 |
| P2-14 | `todo-comments.nvim` 目前 `opts = {}` 且无键位 | 装上却几乎没用起来 |
| P2-15 | `telescope` 补 `defaults`（`vimgrep_arguments`、`file_ignore_patterns`、layout 等） | 当前只配了 `pickers` 与 extension |
| P2-16 | lazy.nvim 未配 `checker` / `change_detection` / `install.colorscheme`，且 `rocks` 可关 | 缺更新检查与锁文件变更提示；`checkhealth` 有 luarocks 噪音 |
| P2-17 | `render-markdown` 加 `latex = { enabled = false }`（与 `render-latex` 共存时两个作者的共同建议） | 避免两个插件争抢 `conceallevel`/LaTeX 渲染 |

---

## 1. 详细说明：P0 Bug

### 1.1 `<leader>u` 缺少 `:` —— `lua/config/telescope.lua`

```lua
-- 现状（第 21 行）
vim.keymap.set("n", "<leader>u", "Telescope git_status<CR>")
-- 同文件其他映射都是对的
vim.keymap.set("n", "<leader>f", ":Telescope find_files<CR>")
```

普通模式映射的 rhs 如果不以 `:` 或 `<Cmd>` 开头，会被当作**普通模式按键序列**逐字执行，而不是 Ex 命令。实测：把 rhs 换成 `:Telescope git_status<CR>` 能正常进入 telescope 的 command handler；不带 `:` 的版本不会触发任何命令。

**建议**：统一改成 `"<cmd>Telescope git_status<CR>"`（项目里已有 `<cmd>...</cmd>` 的用法，比 `:` 前缀更稳妥，不会切换模式）。

### 1.2 `<M-Left>` 拼写错误且覆盖前者 —— `lua/keymap.lua`

```lua
19: vim.keymap.set('n', '<M-Left>', "b")            -- 词首跳转
...
32: vim.keymap.set('n', '<M-Left>', ":vetical resize -2<CR>")  -- 拼写错误 + 覆盖第 19 行
```

实测报 `E492: Not an editor command: vetical resize -2`。同时 `<M-Right>` 也是先 `"E"`（第 20 行）后被 `:vertical resize +2`（第 33 行）覆盖，只有 resize 生效。

而且这与 `<C-Up>/<C-Down>/<C-Left>/<C-Right>`（第 26-29 行）功能完全重复。

**建议**：先决定 `<M-Arrow>` 的语义（词移动 vs 窗口 resize），删掉重复定义，修正 `vertical` 拼写。若保留 resize，用 `<Cmd>vertical resize -2<CR>`。

### 1.3 光标文档高亮会永久失效 —— `lua/options.lua`

```lua
83: vim.api.nvim_create_autocmd({ "CursorHold" }, {
87:     if vim.fn.mode() == "n" and vim.fn.visualmode() == "" then
90:         vim.lsp.buf.document_highlight()
```

`vim.fn.visualmode()` 返回**上一次使用的可视模式**（`'v'/'V'/Ctrl-V`），初始为 `''`。一旦用户做过一次可视选择，它就再也不是 `''`，于是条件恒假，CursorHold 高亮**此后整个 session 都不再触发**。

实测：
- 任何可视选择之前：`visualmode() == ""`
- 做一次 `v` 之后：`visualmode() == "v"`

此外 `mode() == "n"` 本身已经排除了可视模式，第 87 行的 `visualmode()` 判断是多余且有害的。

**建议**：删掉 `visualmode()` 判断，只保留 `vim.fn.mode() == "n"`。

另外两点（组织性）：
- 这段 autocmd、`clipboard` 的 `vim.g.clipboard`、`updatetime` 都塞在 `options.lua` 里。建议拆成 `options.lua`（纯 `vim.opt`）+ `autocmds.lua` / `clipboard.lua`。
- `clear_document_highlights()` 里用 `pcall(vim.lsp.buf.clear_references)` 在每次 `CursorMoved` 都调用一次；功能上可以，但更干净的做法是只在确实有高亮时清理，或改用 `vim.lsp.document_highlight` 的官方示例写法。

### 1.4 mini.comment 选项名拼错 —— `lua/config/mini-comment.lua`

```lua
7: minicomment.setup({
8:     mappings = {
9:         comment = '<leader>c',
10:        comment_line = '<leader>c',
11:        comment_visual = '<leader>c',
12:        text_object = '<leader>c'   -- ← 应为 textobject
13:    }
14: })
```

mini.comment 的合法 key 是 `comment` / `comment_line` / `comment_visual` / **`textobject`**（`mini.comment/lua/mini/comment.lua:424` 校验的就是 `config.mappings.textobject`）。`text_object` 被当作无关字段忽略，`textobject` 保持默认 `gc`。所以「把 textobject 也绑到 `<leader>c`」的意图没有实现；运行时 `x gc` 仍然是 `MiniComment.textobject()`。

**建议**：改成 `textobject = '<leader>c'`。另外注意 mini.comment 的逻辑（同文件 448 行）：

```lua
local modes = config.mappings.textobject == config.mappings.comment_visual and { 'o' } or { 'x', 'o' }
```

当 `textobject == comment_visual`（都设成 `<leader>c`）时它只在 `o` 模式注册，而 `comment_visual` 已在 `x` 模式注册——这正是官方推荐的「一键双用」写法。改成 `textobject` 后行为才会变成预期。

**这个拼写错误还有一个不容易察觉的副作用**：因为 `textobject` 保持默认值 `gc`，而 `comment_visual` 是 `<leader>c`，两者不等，于是 448 行走到 `{ 'x', 'o' }` 分支，mini.comment 把**可视模式的 `gc`** 也注册成了 `MiniComment.textobject()`：

```
x gc    sid=3  desc="Comment textobject"  rhs="<Cmd>lua MiniComment.textobject()<CR>"
```

而 Neovim 0.12 **已经内建**了可视模式 `gc`（注释选区，`_core/defaults.lua:180`）。实测对比：

| | 结果 |
|---|---|
| 无配置（纯内建）`Vj` + `gc` | `{ "# print(1)", "# print(2)" }` ✅ 注释了选区 |
| 当前配置 `Vj` + `gc` | `{ "print(1)", "print(2)" }` ❌ 什么都没发生 |
| 当前配置 `Vj` + `<leader>c` | `{ "# print(1)", "# print(2)" }` ✅ |

也就是说 **mini.comment 的配置错误把内建的可视注释键弄坏了**。修好 `textobject` 后，mini.comment 只在 `o <leader>c` 注册 textobject，内建 `x gc` 恢复。

顺带一提：0.12 既已内建 `gc`/`gcc`/可视 `gc`，`mini.comment` 本身已变成**可选**依赖（见 4.8）。

### 1.5 nvim-lspconfig 的 `opts` 是死代码 —— `lua/plugins/nvim-lspconfig.lua`

```lua
opts = {
    ui = { windows = { default_options = { border = "rounded" } } },
    diagnostics = { float = { border = "rounded" } },
},
config = function ()
    vim.lsp.enable({ 'rust_analyzer', 'ty' })
end
```

lazy.nvim 的分支逻辑（`lazy/core/loader.lua:375-392`）：

```lua
if type(plugin.config) == "function" then
    plugin.config(plugin, opts)          -- 只调用 config，不 setup
else
    require(main).setup(opts)            -- 没有 config 函数时才 setup
end
```

本 spec 的 `config` 是函数且签名为 `function ()`，既不接收也不使用 `opts`，所以 `ui` / `diagnostics` 从未生效。

而且即便调用了 `require('lspconfig').setup(opts)`，`ui.windows.default_options` 这套也是 lspconfig v1 的框架选项，v2 里框架本身已 deprecated。

**建议**：
1. 删除这段 `opts`。
2. 浮窗边框统一交给 Neovim 0.11+ 的全局选项：`vim.o.winborder = "rounded"`（见 3.3）。
3. `opts` 里若确实想要默认 LSP 设置，改用 `vim.lsp.config('*', { ... })`。

### 1.6 `LspAttach` 里设了全局映射 —— `lua/lsp.lua`

```lua
3: vim.api.nvim_create_autocmd("LspAttach", {
4:     callback = function(args)
7:         local bufopts = { noremap = true, silent = true }   -- 没有 buffer = args.buf
9:         keymap.set("n", "gr", lsp.buf.references, bufopts)
10:        keymap.set("n", "gd", lsp.buf.definition, bufopts)
11:        keymap.set("n", "gi", lsp.buf.implementation, bufopts)
```

`args` 完全没被使用。实测 `maparg("gd", "n").buffer == 0`，说明是全局映射。语义上「LSP attach 后才有的映射」应该在 buffer 局部注册：

```lua
local bufopts = { noremap = true, silent = true, buffer = args.buf }
```

更实际的问题是：这三个映射随后被 `goto-preview`（`event = "BufEnter"`）全量覆盖，所以 `lsp.lua` 里这段其实**从没起过作用**。两者应当合并到一处（见 2.5）。

### 1.7 `i <S-Tab>` 是死映射 —— `lua/keymap.lua:22`

```lua
22: vim.keymap.set('i', '<S-Tab>', "<Esc><C-w>w")
```

neotab.nvim（`event = "InsertEnter"`）在 setup 时用 `api.nvim_set_keymap("i", config.user.reverse_key, "<Plug>(neotab-reverse)", ...)` 注册全局 `i <S-Tab>`。它晚于 startup 执行，因此**覆盖**了 `keymap.lua` 的这一行，`<Esc><C-w>w` 从未生效。

补充：Neovim 0.12 内建了 `i <Tab>` / `i <S-Tab>` 的 snippet 跳转（`runtime/lua/vim/_core/defaults.lua:241-255`）。blink.cmp 在 `InsertEnter` 注册 buffer-local 映射，会再覆盖这两个全局映射，并把全局映射当作 `fallback` 使用（`blink.cmp/lua/blink/cmp/keymap/fallback.lua:41-60`）。所以实际链路是：

- `<Tab>`：菜单打开 → `select_next`；否则 → 全局 `<Tab>`（= neotab tabout，被 blink 识别为 fallback）
- `<S-Tab>`：菜单打开 → `select_prev`；否则 → 全局 `<S-Tab>`（= neotab tabreverse）

这个组合**能用**，但完全是隐式依赖注册顺序，非常脆弱。`keymap.lua:22` 那行建议直接删除。

### 1.8 textobjects 的 `]d` / `[d` 被覆盖 —— `lua/config/treesitter-textobj.lua`

```lua
44: vim.keymap.set({ "n", "x", "o" }, "]d", function() move.goto_next("@conditional.outer", "textobjects") end)
45: vim.keymap.set({ "n", "x", "o" }, "[d", function() move.goto_previous("@conditional.outer", "textobjects") end)
```

`lua/lsp.lua:18-19` 在 startup（`init.lua` 最后一行 `require('lsp')`）注册了 `]d`/`[d` 的诊断跳转。实测运行时 `]d` 就是 lsp.lua 的 callback。textobjects 的 conditional 跳转从未生效。

**建议**：诊断跳转用 Neovim 0.11+ 已内建的 `]d` / `[d`（可以不显式映射），把 conditional 跳转移到别的键位（如 `]c` / `[c`，或 `<leader>]c`）。

### 1.9 `.tex` 文件从不启动 treesitter —— `lua/config/treesitter.lua:28`

```lua
28: local auto_start = { "python", "rust", "html", "latex", "yaml" }
```

Neovim 里的 LaTeX **filetype 是 `tex`**（`runtime/ftplugin/tex.vim` 第 2 行：`" Language: LaTeX (ft=tex)`），根本不存在 `latex` 这个 filetype。所以 `pattern` 里的 `"latex"` 永远不会匹配 `.tex` 文件。

实测探针：

```
ft for x.tex                  : "plaintex"    (内容含 LaTeX 时为 "tex")
tex buffer: treesitter active = false
py  buffer: treesitter active = true
```

即 parser 装了，但 `.tex` 文件**高亮从未开启**。

**建议**（两种都行）：

```lua
-- 方案 A：直接改对
local auto_start = { "python", "rust", "html", "tex", "plaintex", "yaml" }

-- 方案 B：动态推导，天然免疫 parser↔filetype 不一致
local patterns = {}
for _, p in ipairs(parsers) do
    vim.list_extend(patterns, vim.treesitter.language.get_filetypes(p))
end
```

注意 `get_filetypes("latex")` 在本机返回 `{ "latex", "tex" }`（`latex` 是 nvim-treesitter 通过 `plugin/filetypes.lua` 的 `latex = { 'tex' }` 注册的别名），但不含 `plaintex`，方案 B 仍建议手动补 `plaintex`。

### 1.10 `<C-4>` 的 rhs 不会进入插入模式 —— `lua/keymap.lua:13`

```lua
13: vim.keymap.set('i', '<C-4>', "<Esc><$>a")
14: vim.keymap.set('i', '<C-6>', "<Esc><^>i")
```

第 14 行是对的（`<^>` = 第一个非空白字符，`i` 进入插入）。但第 13 行的 `<$>` 并不是一个整体：

- `<` 是「左移」操作符
- `$` 是它的 motion（到行尾）
- 其后的 `>` 又开启一个新的操作符（等待 motion）
- `a` 不是 motion → 操作被取消，**`a` 从未执行**，也**不会进入插入模式**

缩进行实测：

```
<$>a  -> "    indented line here"   cursor={1,21}  mode=n     (8 空格被左移成 4 空格)
<$    -> 同上（说明 `>a` 是无效尾巴）
<<    -> "    indented line here"   cursor={1,10}
$a    -> "        indented line here"  cursor={1,25}
```

**建议**：按真实意图二选一：
- 若要「跳到行尾并插入」（与 `<C-6>` 对称）：`"<Esc>$a"`
- 若要「取消缩进」：`"<Esc><<"`（不需要 `a`）

### 1.11 `gi` 遮蔽了 Vim 原生命令 —— `lua/lsp.lua:11` + `lua/config/preview.lua:9`

```lua
-- lua/lsp.lua
11: keymap.set("n", "gi", lsp.buf.implementation, bufopts)
-- lua/config/preview.lua
 9: vim.keymap.set('n', 'gi', "<cmd>lua require('goto-preview').goto_preview_implementation()<CR>")
```

`gi` 不是「implementation 的缩写」，而是 Vim 的**原生命令**：`:h gi` ——「Insert text in the same position as where Insert mode was stopped last time」（回到上次退出插入模式的位置继续输入）。这是日常使用频率很高的命令。

Neovim 0.12 为 implementation 提供的内建键位是 **`gri`**（`_core/defaults.lua:221`），不是 `gi`。当前配置把 `gi` 抢走，等于**静默丢掉了原生命令**。

更值得注意的是：本项目 Python 用的是 `ty`，而 `ty` 官方**不支持 `textDocument/implementation`**（astral-sh/ty#3514），所以 `gi` / `gri` 在 Python 下**本身就是空操作**——代价是丢掉一个高频原生命令，换来的却是什么都没有。

**建议**：删掉 `lua/lsp.lua:11` 与 `lua/config/preview.lua:9` 的 `gi` 映射，把 `gi` 还给原生；implementation 需要时用内建 `gri`（并在 Rust 等支持该能力的语言下才有意义）。

---

## 2. 组织性审查

### 2.1 目录与命名

```
lua/
  init 层     init.lua, options.lua, keymap.lua, diagnostic.lua, lsp.lua, colorscheme.lua, lazynvim.lua
  config 层   config/{telescope,lualine,nvim-tree,aerial,mini-comment,preview,toggleterm,treesitter,treesitter-textobj}.lua
  plugins 层  plugins/<plugin>.nvim.lua
```

问题：

1. **`lua/config/` 是「插件的 setup 细节」，`lua/plugins/` 是「spec」**，但边界不清：
   - `lua/plugins/gitsigns.nvim.lua`、`dropbar.nvim.lua`、`night-owl.nvim.lua`、`mini-diff.nvim.lua`、`goto-preview.nvim.lua`、`treesitter-textobj.lua` 把 setup 写在 spec 里，其余放 `lua/config/`。建议二选一并统一（推荐全部放 spec 的 `opts`，只有逻辑复杂时才拆 `lua/config/`）。
2. **文件命名不统一**：
   - `lua/plugins/tele-file-browser.nvim.lua` 插件真名是 `telescope-file-browser.nvim` → 改名。
   - `lua/plugins/neotab.lua` 插件是 `neotab.nvim` → 建议 `neotab.nvim.lua`。
   - `lua/config/preview.lua` 装的是 `goto-preview` → 建议 `goto-preview.lua`。
3. **mini 系列仓库来源不一致**：`mini-comment.lua` 用 `nvim-mini/mini.comment`，`mini-diff.nvim.lua` 用 `echasnovski/mini.diff`。两者都存在，但建议统一（推荐 monorepo `echasnovski/mini.nvim` + 按模块 require，或统一用 split repo）。
4. **`lua/colorscheme.lua` 4 行的模块用 `pcall(vim.cmd, ...)` 兜底**，但 `night-owl.nvim.lua` 已经 `lazy = false` 保证加载；同时 `catppuccin` 整个插件在启动时加载却不用。建议删除 catppuccin spec，或把主题选择改成可切换的配置项。

### 2.2 重复与冗余

| 重复项 | 说明 |
|---|---|
| `<leader>o` | `aerial`（`bind AerialToggle!`）与 `outline.nvim`（`keys = { <leader>o }`）。实测 aerial 胜出，outline 的 keys 永不触发。二者功能重复，建议**二选一** |
| `<leader>b` | `lua/config/nvim-tree.lua:7` 与 `lua/plugins/nvim-tree.lua:6-8` 各定义一次 |
| `<M-Left>`/`<M-Right>` | 见 1.2，各定义两次 |
| `<C-Up/Down/Left/Right>` vs `<M-Up/Down/Left/Right>` | 都是窗口 resize，功能重复 |
| `<leader>f` 与 `<C-p>` | 都是 `find_files` |
| `nvim-tree` 与 `telescope-file-browser` | 两个文件浏览器（`<leader>b` 与 `<leader>e`）；`lua/config/nvim-tree.lua:12` 还专门写注释说「不劫持 netrw，保留给 telescope-file-browser」。如果 telescope file_browser 已够用，nvim-tree 可以移除 |
| `gitsigns` 与 `mini.diff` | mini.diff 被显式关了（`source = diff.gen_source.none()`），只作为 origami 的 git 装饰来源保留。没问题，但值得加注释说明 |
| `catppuccin` | 完全未使用 |

### 2.3 代码风格

- **缩进**：`keymap.lua`、`options.lua`、`diagnostic.lua` 用 4 空格；`blink-cmp.nvim.lua` 用 2 空格；`toggleterm.nvim.lua`、`catppuccin.nvim.lua`、`nvim-lspconfig.lua:26` 用 Tab。
- **引号**：`'single'` 与 `"double"` 混用。
- **注释语言**：中文（`options.lua` 65-93、`diagnostic.lua`、`lua/config/nvim-tree.lua`）与英文（`treesitter.lua`、`lsp.lua`）混用。
- **未使用变量**：`lua/keymap.lua:1-4` 的 `opts`（`vim.keymap.set` 默认就是 noremap，且全程没用到）；`lua/colorscheme.lua:4` 的 `catppuccin`。
- **注释与代码不符**：
  - `options.lua:23` `hlsearch = true -- do not highlight matches`（注释写反了）
  - `options.lua:16-17` `splitbelow -- open new vertical split bottom` / `splitright -- open new horizontal splits right`（below/right 对应 horizontal/vertical 反了）
  - `blink-cmp.nvim.lua:44` `-- (Default) Only show the documentation popup when manually triggered` 但下面设的是 `auto_show = true`（注释是模板残留）
- **`lua/plugins/nvim-lspconfig.lua:65`** 的 `end` 缩进错位（`        end` 与 `    config` 不齐）。
- **缺少格式化/静态检查配置**：没有 `.stylua.toml`、`.editorconfig`、`.luacheckrc`。建议加入 `stylua`（可以在 CI 或本地 `:Conform`/`stylua --check` 校验）。

### 2.4 结构建议（可选，供讨论）

一个更清晰的划分：

```
lua/
  options.lua          -- 纯 vim.opt（把 autocmd / clipboard 拆出去）
  keymap.lua           -- 全局按键（去重、加 desc）
  autocmds.lua         -- 通用 autocmd（含 document_highlight）
  clipboard.lua        -- OSC52 配置
  diagnostic.lua
  lsp.lua              -- LspAttach / 格式化 / inlay hints（与 goto-preview 协调）
  colorscheme.lua
  lazynvim.lua
  config/<plugin>.lua  -- 仅当 setup 逻辑超过 ~15 行时
  plugins/<plugin>.lua -- spec + opts（简单配置直接写 opts，不拆文件）
```

同时给所有 `vim.keymap.set` 加 `desc`（有助于 `which-key`，也方便 `:map` 排查）。当前 `lua/config/*` 里绝大多数映射都没有 `desc`。

---

## 3. Legacy / 弃用风险

### 3.1 `vim.loop` → `vim.uv`（`lua/lazynvim.lua:4`）

`vim.loop` 在 0.10 起就是 `vim.uv` 的别名，`deprecated.txt` 明确写着 `• vim.loop  Use vim.uv instead.`（0.12 仍可用，但属 legacy）。

```lua
if not vim.uv.fs_stat(lazypath) then
```

### 3.2 noice 的 LSP override（`lua/plugins/noice.nvim.lua`）

```lua
override = {
    ["vim.lsp.util.convert_input_to_markdown_lines"] = true,
    ["vim.lsp.util.stylize_markdown"] = true,          -- 0.12 deprecated
    ["cmp.entry.get_documentation"] = true,            -- 需要 nvim-cmp
},
```

- `vim.lsp.util.stylize_markdown()` 在 `deprecated-0.12` 列表中：`Use |vim.treesitter.start()| with vim.wo.conceallevel = 2`。这两个 `vim.lsp.util.*` override 仍然是**有用**的：内建 `K` hover 和 `<C-S>` signature help 走的就是这两个函数，noice 让它们用 treesitter 渲染 markdown。
- `cmp.entry.get_documentation` 是 nvim-cmp 专用：noice 的实现是 `Hacks.on_module("cmp.entry", function(mod) ... end)`（`noice/lsp/override.lua:12-16`），模块不存在时**永不触发**。本项目用 blink.cmp，运行时 `package.loaded["cmp.entry"] == nil`，属死配置。（noice 目前**没有** blink.cmp 集成，所以也不需要替代项。）

**建议**：删除 `cmp.entry.get_documentation` 一行；另外两个保留。`stylize_markdown` 的 deprecation 属 noice 上游需要跟进的问题（当前 noice 版本仍支持该 key，覆盖本身也让它不再是被弃用的实现），风险低，等上游更新即可。

### 3.3 浮窗边框的现代化做法

`nvim-lspconfig.lua` 的 `opts.ui`、`diagnostic.lua` 的 `float = { border = 'rounded' }`、`gitsigns.preview_config.border`、`dropbar.menu.win_configs.border`、`blink.cmp.completion.menu.border` 都在重复同一件事。Neovim 0.11+ 提供全局默认：

```lua
vim.o.winborder = "rounded"   -- 当前 options.lua:34 是注释掉的
```

`checkhealth` 显示当前 `winborder` 为 `""`（无边框）。开启后可删除大部分局部 border 设置（blink.cmp 的 `menu.border` 默认值会继承 `vim.o.winborder`）。

这一点在 Neovim 源码里可以确认：`runtime/lua/vim/lsp/util.lua` 里预览窗口取边框的逻辑是 `local border = opts and opts.border or vim.o.winborder`，也就是说所有 LSP 浮窗（hover / signature help 等）都会继承 `winborder`。

**唯一需要注意的是优先级**：`vim.diagnostic.config({ float = { border = "rounded" } })` 这种**显式**设置会覆盖 `winborder`，而两者值相同，所以设了 `winborder` 后 `diagnostic.lua:14` 那行可以删掉。`blink.cmp` 的 `completion.menu.border` 默认值是 `nil` → 回落到 `vim.o.winborder`，也可以删。

### 3.4 nvim-lspconfig / mason 生态

核对结论（对照 v2.11.0 源码与官方文档）：

- **`require('lspconfig')` 框架已 deprecated**：`lua/lspconfig.lua` 在按名字取 config 时会调用
  `vim.deprecate('The require(\'lspconfig\') "framework"', 'vim.lsp.config', 'v3.0.0', ...)`。
  注意 **nvim-lspconfig 本身没有废弃**（server config 移到了 `lsp/` 目录），废弃的只是 `require('lspconfig')` 这套框架。
- **框架根本没有 `setup()`**：`lua/lspconfig.lua` 只返回 `{ util, server_aliases }`。所以 `opts` 里那些键即使被调用也落不到实处。
- **`ui.windows.default_options` 已被移除/置空**：v1.8.0 的文档就写了 "The `require('lspconfig.ui.windows')` API was removed"，v2 里 `lspconfig/ui/windows.lua` 是个 stub（`default_options = {}`）。
- **`diagnostics.float` 从来不是 lspconfig 的选项**，属凭空发明。
- 所以 `lua/plugins/nvim-lspconfig.lua` 的 `opts` 是「死代码 + 无效键」双重无效（见 P0-5）。
- `lsp/ty.lua` 只以新 API 提供；`lua/lspconfig/configs/` 里**没有** `ty.lua`。配置里注释掉的 `lspconfig.<name>.setup({})` 示例应更新为：

```lua
vim.lsp.config('pylsp', { settings = { pylsp = { plugins = { ... } } } })
vim.lsp.enable('pylsp')
```

- 全局默认值用 `'*'`（合并优先级最低）：
  ```lua
  vim.lsp.config('*', { capabilities = { ... } })
  ```
  合并顺序（低 → 高）：`'*'` → `lsp/<name>.lua` → `after/lsp/<name>.lua` → `vim.lsp.config(name, {...})`。
- **0.12 的 LSP 命令变化**：`:lsp enable|disable|restart|stop` 是新命令，`:LspStart/:LspStop/:LspRestart` 是 ≤0.11 的 legacy 别名。
- `mason-lspconfig.nvim` 的 `ensure_installed` **仍然有效**（未被废弃）；但 **v2.0.0 移除了 `handlers` / `.setup_handlers()` / `automatic_installation`**，新增 `automatic_enable`（默认 `true`）。当前配置没有使用被移除的 key，✅。
- 因为 `automatic_enable` 默认为 `true`，mason-lspconfig 会自动 `vim.lsp.enable()` 所有 **通过 Mason 安装** 的 server，所以 `nvim-lspconfig.lua` 里手写的 `vim.lsp.enable({ 'rust_analyzer', 'ty' })` 是冗余的（当前 mason 只装了 `rust-analyzer` 和 `ty`，结果等价）。若想严格控制启用列表，显式设置 `automatic_enable = { exclude = {...} }` 或 `false`。

### 3.5 `lazy.nvim` setup 参数

`require("lazy").setup("plugins")` 没配任何 defaults。常用且值得加：

```lua
require("lazy").setup("plugins", {
    checker = { enabled = true, notify = false },   -- 后台检查更新
    change_detection = { notify = true },           -- lazy-lock.json 变更提示
    install = { colorscheme = { "night-owl", "default" } },  -- 安装期的兜底主题
    rocks = { enabled = false },                    -- 本项目无 luarocks 依赖，可消除 checkhealth 噪音
})
```

`checkhealth lazy` 当前有 3 warning + 1 error（hererocks/luarocks 未安装），因无插件依赖 luarocks，可直接 `rocks = { enabled = false }` 消掉。

### 3.6 其他 API 层面

- `lua/lsp.lua:9-11` 用 `lsp.buf.references` / `definition` / `implementation` 覆盖 `gr` / `gd` / `gi`：`grn/gra/grr/gri/grt/gO` 是 0.11+ 内建，`gr` 作为前缀与它们歧义。按 `:h map-ambiguous`：「当两个映射以相同字符序列开头时…Vim 会再读一个字符来决定」，因此单独按 `gr` 会**等待 `timeoutlen`（当前 1000ms）**才展开。配合 `goto-preview` 的覆盖，建议把 preview 全部改到 `<leader>g*` 前缀，保留内建 `gr*` / `gd`。
- `lua/plugins/goto-preview.nvim.lua` 的 `gt` 覆盖了内建「下一个 tab」。建议改为 `<leader>gt`。
- `lua/plugins/nvim-treesitter.lua` 用 `branch = "main"`，与 `lua/config/treesitter.lua` 的新 API（`install()` + `vim.treesitter.start()`）一致，方向正确；`lua/config/treesitter-textobj.lua` 的 `select` 选项布局也与 main 分支一致。
- `lua/plugins/nvim-treesitter.lua` 的 `branch = "main"` 现在**是冗余的**：`main` 已是 nvim-treesitter 的默认分支（`master` 被冻结在 Neovim 0.11）。保留无害，可删。
- `nvim-treesitter` **不支持懒加载**（上游 README 明确说明），当前 `lazy = false` 是正确写法，`build = ":TSUpdate"` 也是必需的（插件按 release 钉住 parser revision，parser 过期会导致 ABI/query 不匹配）。

### 3.7 treesitter / fold / indent 现状核对

已对照 nvim-treesitter `main` 与 Neovim 0.12.5 源码核对，结论：

- `require("nvim-treesitter").install(parsers)` ✅ 当前正确 API。
- `setup({ ensure_installed = ... })` / `nvim-treesitter.configs` ❌ 在 `main` 上已**彻底移除**（只存在于冻结的 `master`）。当前配置没有用，正确。
- `vim.treesitter.start()` ✅ 就是上游推荐写法。
- Neovim 0.12 **自带** ftplugin 已经会 `vim.treesitter.start()`：`lua` / `markdown` / `help(vimdoc)` / `query`。所以 `auto_start` 里其实只需要非内建的那些（当前列了 `python/rust/html/latex/yaml`，方向对，但 `latex` 拼错，见 1.9）。
- **fold**：nvim-treesitter `main` 没有 fold 模块，折行由 Neovim core 的 `vim.treesitter.foldexpr()` 提供。当前配置里没有任何 `foldexpr`/`foldmethod` 设置，完全依赖 `nvim-origami`（它自己会设）。这是可接受的，但要意识到「没有 origami 就没有 treesitter 折行」。
- **indent**：nvim-treesitter 仍提供 `indentexpr()`（上游标注 **experimental**），Neovim 0.12 core **没有** treesitter indent。当前配置走 runtime 的 `indent/python.vim` 路线（见 4.2），是有意的、稳妥的选择。
- `vim.treesitter.language.require_language()` 在 0.12 已 deprecated，改用 `.add()`（当前配置未使用，仅提示）。

### 3.8 已弃用的 `vim.diagnostic.goto_*` —— `lua/lsp.lua:18-19`

```lua
18: vim.keymap.set('n', '[d', function() vim.diagnostic.goto_prev({ float = { border = "rounded" } }) end, opts)
19: vim.keymap.set('n', ']d', function() vim.diagnostic.goto_next({ float = { border = "rounded" } }) end, opts)
```

`runtime/lua/vim/diagnostic.lua:1562,1719` 里两者都调用了 `vim.deprecate(..., '0.13')`。实测直接调用会打印：

```
vim.diagnostic.goto_next() is deprecated. Run ":checkhealth vim.deprecated" for more information
```

`doc/deprecated.txt:80-81` 给出的替代是 `vim.diagnostic.jump({ count = 1, float = true })`。

更关键的是：Neovim 0.12 **已经内建**了 `]d` / `[d`（`_core/defaults.lua:263,267`，内部就是 `vim.diagnostic.jump`），还额外内建了 `]D` / `[D`（最后/第一条诊断）和 `<C-W>d` / `<C-W><C-D>`（浮窗查看）。

**建议**：直接删除 `lua/lsp.lua:18-19` 这两行，用内建行为；浮窗边框交给 `vim.o.winborder`（见 3.3）。

### 3.9 已核对、无需改动的插件（同样重要）

审计也确认了一批「看起来可能过时、实际是当前写法」的地方，避免误改：

| 插件 | 核对结论 |
|---|---|
| `blink.cmp` v1.10.2 | `keymap.preset` / `appearance.nerd_font_variant` / `completion.documentation.auto_show` / `completion.menu.border` / `completion.list.selection.preselect` / `completion.list.selection.auto_insert` / `sources.default` / `opts_extend` **全部有效**；`version = "1.*"` 正确（最新 v1.10.2，无 2.x）；预编译 Rust 二进制**自动下载**，不需要 `build` |
| `render-markdown.nvim` v8.14.0 | 已是最新版；`render_modes = true`、`anti_conceal.{enabled,disabled_modes,above,below,ignore}` 全部有效。唯一冗余：`ignore` 的 4 个 key 正好等于默认值 |
| `render-latex.nvim` | 模块名 `render_latex`（lazy 自动识别，无需 `main`）；5 个 option 全部有效（`preset = "match_text"` 合法，README 里的注释写错了，以代码为准） |
| `nvim-treesitter` main | `install()` + `vim.treesitter.start()` 是当前推荐 API；`ensure_installed` / `nvim-treesitter.configs` 在 main 上已彻底移除（本配置未使用，✅）；`lazy = false` + `build = ":TSUpdate"` 正确 |
| `nvim-treesitter-textobjects` main | 模块路径、函数名（`goto_next_start` 等）、`setup({ select = {...} })` 布局全部当前 |
| `toggleterm.nvim` | `float_opts.border = "curved"` **合法**（curved 是 toggleterm 自己实现的自定义边框，不是 nvim_open_win 的原生值） |
| `noice.nvim` | `views.cmdline_popup` / `views.popupmenu` / `presets.*` 均为当前支持的 key |
| `nvim-tree.lua` | `sort_by` / `hijack_netrw` / `git` / `filters` / `view` / `renderer` 均存在；`filters.enable` 默认就是 `true` |
| `nvim-lspconfig` v2 + `mason-lspconfig` | `ensure_installed` 未被废弃；配置未使用 v2.0.0 移除的 `handlers` / `automatic_installation` ✅ |
| `mini.diff` / `mini.comment` / `gitsigns` / `lualine` / `flash` / `neoscroll` / `todo-comments` / `outline` / `aerial` / `dropbar` / `night-owl` / `catppuccin` / `lazygit` / `nvim-autopairs` | 逐项比对后未发现**改名或移除**的配置项 |

**未能彻底核对的两项**（本机 `git ls-remote` 与 GitHub API 均被网络限制，建议自行确认）：

- `oxfist/night-owl.nvim`：本机 pin 在 **2024-09-11**，是仓库里最旧的依赖。需确认是上游不活跃还是 lock 陈旧。
- `neotab.nvim` / `telescope-file-browser.nvim`：上游维护状态未验证。

---

## 4. 功能性审查

### 4.1 缺失的核心选项（体验收益高）

| 选项 | 当前值 | 建议 | 理由 |
|---|---|---|---|
| `undofile` | `false` | `true` | 重开文件仍可撤销；这是最大缺口 |
| `scrolloff` | `0` | `8`（或 `5`） | 光标不停在屏幕边缘，阅读/滚动更舒服 |
| `signcolumn` | `auto` | `yes` | 避免 git/diagnostic sign 出现时文本横向跳动 |
| `winborder` | `""` | `rounded` | 全局浮窗边框（0.11+） |
| `timeoutlen` | `1000` | `300` | 大量 `<leader>` 与 `gr*` 前缀，1000ms 偏长 |
| `laststatus` | `2` | `3` | 全局 statusline（配合 lualine 更现代） |
| `confirm` | `false` | `true` | 未保存时退出会提示，防误操作 |
| `pumheight` | `0` | `10` 左右 | 补全菜单不占半个屏幕 |
| `linebreak`+`breakindent` | `false` | `true` | markdown/长行可读性 |
| `list`+`listchars` | `false` | 视偏好 | 显示 tab/trailing space；写 Python 时有用 |
| `fillchars` | `""` | `eob: ,vert:│` | 视觉整洁 |
| `numberwidth` | `4` | `3`~`4` | 视行号位数 |
| `cursorlineopt` | `both` | `number` | 只高亮行号，减少视觉噪音 |
| `virtualedit` | `""` | 视偏好 | 配合列编辑 |
| `swapfile` | `true` | 视偏好 | 若启用 `undofile`，常与 `swapfile=false` 搭配 |

注意 `termguicolors`、`number`、`relativenumber`、`cursorline`、`incsearch`、`ignorecase`、`smartcase`、`completeopt`、`mouse`、Tab 相关设置都已正确配置。

### 4.2 Python 缩进配置重复

```lua
36: vim.g.pyindent_open_paren   = '&shiftwidth'
37: vim.g.pyindent_nested_paren = '&shiftwidth'
38: vim.g.pyindent_continue     = '&shiftwidth'
39: vim.g.python_indent         = { closed_paren_align_last_line = false }
```

Neovim `runtime/autoload/python.vim:6-17` 的逻辑是：

```vim
" need to inspect some old g:pyindent_* variables to be backward compatible
let g:python_indent = extend(get(g:, 'python_indent', {}), #{
  \ open_paren: get(g:, 'pyindent_open_paren', 'shiftwidth() * 2'),
  ...
```

即 `g:python_indent` 是**现代 API**，`g:pyindent_*` 是它读取的 legacy 兼容变量。两套都设且值一致 → 冗余。

**建议**：只保留现代写法：

```lua
vim.g.python_indent = {
    open_paren = '&shiftwidth',
    nested_paren = '&shiftwidth',
    continue = '&shiftwidth',
    closed_paren_align_last_line = false,
}
```

### 4.3 LSP 键位与能力

当前配置只显式写了：

```lua
gd -> definition, gi -> implementation, gr -> references   -- 且被 goto-preview 覆盖成 preview
[d/]d -> 诊断跳转（已弃用 API，见 3.8）
```

**Neovim 0.12 内建的 LSP/诊断键位**（逐一对照 `runtime/lua/vim/_core/defaults.lua`，无需安装任何插件）：

| 键位 | 功能 | 源码位置 |
|---|---|---|
| `grn` | rename | `defaults.lua:204` |
| `gra` | code action（n/x） | `defaults.lua:208` |
| `grx` | codelens run | `defaults.lua:212` |
| `grr` | references | `defaults.lua:216` |
| `gri` | implementation | `defaults.lua:220` |
| `grt` | type definition | `defaults.lua:224` |
| `gO` | document symbol | `defaults.lua:228` |
| `i/s <C-S>` | signature help | `defaults.lua:232` |
| `]d` / `[d` | 下/上一条诊断（`vim.diagnostic.jump`） | `defaults.lua:263,267` |
| `]D` / `[D` | 最后/第一条诊断 | `defaults.lua:271,275` |
| `<C-W>d` / `<C-W><C-D>` | 浮窗查看光标处诊断 | `defaults.lua:279` |
| `gc` / `gcc` / `x gc` | 注释（**内建**，非 mini.comment） | `defaults.lua:177-191` |
| `i/s <Tab>` / `<S-Tab>` | snippet 跳转 | `defaults.lua:238-255` |

两个容易踩的点：

1. **`K` → hover 是内建的（buffer-local）**，不需要自己配。实现见 `runtime/lua/vim/lsp.lua:871`：

   ```lua
   if client:supports_method('textDocument/hover')
     and is_empty_or_default(bufnr, 'keywordprg')
     and vim.fn.maparg('K', 'n', false, false) == ''   -- 没有全局 K 映射时才建
   then
     vim.keymap.set('n', 'K', function() vim.lsp.buf.hover() end,
       { buf = bufnr, desc = 'vim.lsp.buf.hover()' })
   ```

   ⚠️ 反过来要注意：**如果你自己加一个全局 `K` 映射，内建的 hover 就不会被创建**。所以这里「什么都不做」才是对的。同理 `'formatexpr'` 会被自动设为 `v:lua.vim.lsp.formatexpr()`，即 `gq` 可以直接格式化。

2. **`gd` / `gi` / `gr` 都不是内建 LSP 键位**（内建的是 `gr*` 三键序列）。所以：
   - `gd` 被覆盖 → 原生 `gd`（跳到本地声明）被遮蔽，不过 LSP `gd` 语义基本一致，这是社区通行做法，可以接受。
   - `gi` 被覆盖 → 原生 `gi`（回到上次插入位置）丢失，**不推荐**（见 1.11）。
   - `gr` 被占用 → 内建 `grn/gra/grx/grr/gri/grt` 都在同一前缀下产生歧义（`:h map-ambiguous`），按 `gr` 会等 `timeoutlen`。注意它**不会**让 `gr*` 失效（只要在 `timeoutlen` 内继续按第三键仍会匹配长映射），只是变慢。

建议的键位方案（把 preview 收进 `<leader>` 前缀，把 `gi` 还给原生）：

```lua
-- LSP 相关只留必要的；grn/gra/grr/gri/grt/gO/]d/[d/K/gq 全部用内建
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local o = { buffer = args.buf, desc = "LSP" }
    -- 如需自定义再加，例如 <leader>f 格式化
    vim.keymap.set("n", "<leader>f", function()
      vim.lsp.buf.format({ bufnr = args.buf, timeout_ms = 2000 })
    end, { buffer = args.buf, desc = "Format buffer" })
  end,
})
-- preview 改到 <leader>P*（因为 <leader>g 已被 lazygit 占用）
vim.keymap.set("n", "<leader>Pd", "<cmd>lua require('goto-preview').goto_preview_definition()<CR>", { desc = "Preview definition" })
vim.keymap.set("n", "<leader>Pr", "<cmd>lua require('goto-preview').goto_preview_references()<CR>", { desc = "Preview references" })
vim.keymap.set("n", "<leader>Pi", "<cmd>lua require('goto-preview').goto_preview_implementation()<CR>", { desc = "Preview implementation" })
vim.keymap.set("n", "<leader>Pt", "<cmd>lua require('goto-preview').goto_preview_type_definition()<CR>", { desc = "Preview type def" })
```

缺口（当前完全没有）：

| 功能 | 建议键位 | 备注 |
|---|---|---|
| 格式化 | `<leader>f` + format on save | 全仓库 `vim.lsp.buf.format` 出现 **0** 次 |
| inlay hints | `<leader>ih` toggle | 0.12 的签名是 `vim.lsp.inlay_hint.enable(enable, { bufnr = buf })`，旧的 `enable(true, 0)` 写法**已失效** |
| 诊断浮窗 | `<C-W>d`（内建）或另分配 | 原 `<leader>e` 被 file_browser 占用 |
| 诊断列表 | `<leader>d`（已有，telescope diagnostics） | ok |

**format on save** 是最值得补的功能，但有一个**配置相关的坑**：当前只启用了 `ty`，而 ty 官方明确**不提供格式化**（"Use Ruff for formatting"）。所以要做 Python 的 format-on-save，必须额外接入 `ruff`（`vim.lsp.config('ruff', {...})` + `vim.lsp.enable('ruff')`，Mason 里装 `ruff`）。

推荐的 format-on-save 写法（官方 `:h lsp-attach` 模式，按 server 白名单）：

```lua
vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("config.lsp", { clear = false }),
  callback = function(ev)
    local client = vim.lsp.get_client_by_id(ev.data.client_id)
    if not client then return end
    if client:supports_method("textDocument/formatting") then
      vim.api.nvim_create_autocmd("BufWritePre", {
        group = vim.api.nvim_create_augroup("config.lsp", { clear = false }),
        buffer = ev.buf,
        callback = function()
          vim.lsp.buf.format({ bufnr = ev.buf, id = client.id, timeout_ms = 2000 })
        end,
      })
    end
  end,
})
```

### 4.4 blink.cmp 细节

已核对 v1.10.2 源码/官方文档：

1. **`fuzzy.implementation = "rust"`**：`"rust"` 仍是合法值，但含义是「必须用 Rust，没有预编译二进制就报错」。默认值是 `"prefer_rust_with_warning"`（失败时回退 Lua 并告警）。建议改为默认值。

2. **`['<Enter>'] = { 'select_and_accept', 'fallback' }`**：合法但非官方推荐的「回车换行」写法。`select_and_accept` 在「菜单打开但未选中任何项」时也会接受**第一项**。若要「选中才接受，否则换行」，应使用：
   ```lua
   ['<CR>'] = { 'accept', 'fallback' },
   completion = { list = { selection = { preselect = false } } },  -- 已满足
   ```

3. **`preset = 'none'` 的代价**：配置重新绑定了 `<Tab>/<S-Tab>/<Up>/<Down>/<Enter>/<C-y>`，但丢掉的不只是这些：
   - `<C-space>`（打开菜单/文档）**未绑定**
   - `<C-e>`（隐藏菜单）**未绑定**
   - `<C-n>` / `<C-p>` **未绑定**
   - `<C-k>`（签名帮助切换）**未绑定**
   - `<Tab>/<S-Tab>` 的 `snippet_forward` / `snippet_backward` 语义丢失（现在会落到 neotab 的 tabout）
   - `<C-y>` 从 preset 的 `select_and_accept` 被改成 `hide`，等于**没有任何**显式 accept 键（只能靠 `<Enter>`）

   建议至少补回 `<C-space>` 和 `<C-e>`，并考虑把 `<C-y>` 保留为 `select_and_accept`（与 Vim 内建补全习惯一致）。

4. **签名帮助**：`signature.enabled` 默认 `false`（官方标注 experimental）。若想用：
   ```lua
   signature = { enabled = true },
   keymap = { ['<C-k>'] = { 'show_signature', 'hide_signature', 'fallback' } },
   ```

5. **cmdline 补全**：v1.10.2 中 `cmdline.enabled` **已默认 `true`**，但菜单默认只在 cmdwin 里 `auto_show`。若想在 `:` / `/` 里弹出补全菜单：
   ```lua
   cmdline = { completion = { menu = { auto_show = true } } },
   ```
   注意 cmdline 模式不继承顶层 `completion.*`，`selection.preselect/auto_insert` 需要单独设。

6. **nvim-autopairs 集成**：官方文档**没有** blink.cmp ↔ nvim-autopairs 的集成说明；nvim-autopairs 自带的 `completion/cmp.lua` 是 nvim-cmp 专用（`require('cmp')`），**不能**和 blink.cmp 一起加载。当前配置靠 `['<Enter>'] = { 'select_and_accept', 'fallback' }` 的 `fallback` 落到 autopairs 的 `<CR>`，这个链路成立；括号补全则由 blink 内建的 `completion.accept.auto_brackets`（默认开）负责。

7. **`version = '1.*'` 正确**：最新 release 是 v1.10.2（2026-04-04），无 2.x。预编译二进制在 tag 上会自动下载，**不需要** `build = 'cargo build --release'`（`checkhealth blink.cmp` 已显示 `blink_cmp_fuzzy lib is downloaded/built`）。

### 4.5 其他功能点

- **`todo-comments.nvim`**：`opts = {}` 且无键位，装上等于没用。建议至少加：
  ```lua
  keys = { { "<leader>st", "<cmd>TodoTelescope<CR>", desc = "Todo (Telescope)" } },
  opts = { signs = true, keywords = { FIX = { icon = "", color = "error" } } },
  ```
  另外它的 `<leader>st` 不会与现有 `<leader>s`（telescope aerial）冲突，因为 `<leader>s` 是叶子映射，按 `<leader>s` 会等 `timeoutlen`……**建议改为 `<leader>ft` 之类**避免前缀歧义。

- **`telescope`**：只设了 `pickers.find_files` 和几个 extension。值得补 `defaults`：
  ```lua
  defaults = {
      layout_strategy = "horizontal",
      sorting_strategy = "ascending",
      layout_config = { prompt_position = "top" },
      file_ignore_patterns = { "%.git/", "node_modules", "__pycache__", "%.venv" },
      vimgrep_arguments = { "rg", "--color=never", "--no-headings", "--with-filename",
                            "--line-number", "--column", "--smart-case", "--hidden" },
  },
  ```

- **`nvim-tree` 的 `filters.enable = false`**：这会**关掉全部过滤**，包括默认开启的 `git_ignored`（即 gitignore 的文件也会显示）。注释写的是「过滤文件」，但值是 `false`。若想显示 dotfiles 但隐藏 gitignored，应改为 `filters = { enable = true, git_ignored = true, dotfiles = true }`。

- **`auto-save.nvim`**（`lua/plugins/auto-save.nvim.lua`）：**这里有配置与意图不一致的问题**。插件默认值是：

  ```lua
  enabled = true,
  trigger_events = {
    immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" },
    defer_save = { "InsertLeave", "TextChanged" },   -- 防抖保存
    cancel_deferred_save = { "InsertEnter" },
  },
  debounce_delay = 1000,
  ```

  而当前配置把 `defer_save` 和 `cancel_deferred_save` 都清空成 `{}`，却设了 `debounce_delay = 300`：

  ```lua
  trigger_events = {
      immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" },
      defer_save = {},              -- ← 关掉了所有防抖保存
      cancel_deferred_save = {}
  },
  debounce_delay = 300              -- ← 因为 defer_save 为空，这个值永远不会生效
  ```

  **结果**：`debounce_delay = 300` 是死配置；实际行为退化成「只在离开 buffer / 失焦 / 退出时保存」。如果本意是「编辑时高频自动保存，300ms 防抖」，现在的写法恰好把它关掉了。

  **建议**：按真实意图二选一：

  ```lua
  -- A. 想要防抖自动保存（推荐，最贴近 "auto-save" 的名字）
  opts = {
      trigger_events = {
          immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" },
          defer_save = { "InsertLeave", "TextChanged" },
          cancel_deferred_save = { "InsertEnter" },
      },
      debounce_delay = 300,
  }

  -- B. 只想要"离开时保存"，那就别写 debounce_delay，并显式注释说明
  opts = {
      trigger_events = { immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" },
                         defer_save = {}, cancel_deferred_save = {} },
  }
  ```

  另外：`enabled` 默认为 `true`（`auto-save.nvim/lua/auto-save/config.lua:4`），配合 `event = {"InsertLeave","TextChanged"}` 意味着**装上就自动保存**，无需 `ASToggle`；建议在 spec 里显式写出 `enabled = true`，避免上游改默认值时行为静默变化。已弃用的 `execution_message` / `cancel_defered_save`（拼写错误的旧名）当前配置都没用 ✅。

- **`clipboard` + OSC52**：`vim.g.clipboard` 覆盖了系统 clipboard provider，只用 OSC52。对远程/终端（wezterm/zellij）是对的，但 OSC52 有大小限制且需要终端支持；如果偶尔在本地 GUI/桌面终端使用，原生 provider 会更可靠。可考虑按环境条件切换。

- **`diagnostic.lua`**：`update_in_insert = true` 在 0.12 仍然合法（默认 `false`），但在 insert 模式持续刷新诊断会有开销，Python 大项目尤其明显；建议默认关闭或按需开。`severity_sort` 建议开。

- **`lualine`**：`lualine_c = { "filename" }`、`lualine_x` 放 filesize/encoding/filetype，配置可用。可考虑加 `"diagnostics"` 与 `"diff"` 组件，以及 `options.globalstatus = true`（配合 `laststatus=3`）。

- **`neoscroll`**：`mappings` 含 `<C-u>/<C-d>/<C-b>/<C-f>/zt/zz/zb`，与内建滚动快捷键绑定，属个人偏好。注意 `use_local_scrolloff = false` + `scrolloff = 0`，建议配合 4.1 一起调整。

- **`treesitter` auto_start 列表**：只覆盖 `python/rust/html/latex/yaml`（`lua/markdown/vimdoc/query` 由 0.12 内建 ftplugin 处理）。`latex` 是错的（见 1.9）。若日常还写 `bash/json/toml/c/cpp`，加到 `parsers` 与 `auto_start` 即可。

### 4.6 markdown / LaTeX 渲染

已核对两个插件的最新版本与作者建议：

- `render-markdown.nvim` 当前 **v8.14.0**（2026-09-15），配置里用到的 key 全部有效。两点可优化：
  - `anti_conceal.ignore` 的 4 个 key（`code_background` / `indent` / `sign` / `virtual_lines`）**正好等于插件默认值**，可以整段删掉。
  - `render_modes = true` 合法，但官方默认是 `{ 'n', 'c', 't' }`；`true` 表示**所有模式**都渲染（含 insert / visual / operator-pending），会让这些模式下的行内渲染更激进。当前看起来是有意的，若想更保守可用默认值。
  - v8 期间移除过 `pipe_table.filler`（8.12.0），配置未使用，无影响。
- `render-latex.nvim` 当前 **v0.1.0-rc4**，仍是 early release（作者声明 v1.0.0 前 option 名可能变）。模块名是 **`render_latex`**（实测 lazy.nvim 能自动识别，`ft = "markdown"` 触发正常，无需 `main`）。5 个 option 全部有效（`preset = "match_text"` 合法，README 里那行注释写错了，以代码为准）。
- **两者在同一 markdown buffer 上有明确重叠**，两个作者的建议是让 render-markdown 关掉 LaTeX 模块：
  ```lua
  -- render-markdown.nvim.lua
  opts = { latex = { enabled = false }, ... }
  ```
  另外 `render-latex` 建议 `conceallevel=2 / concealcursor="nc"`，而 render-markdown 默认在渲染视图里强制 `conceallevel=3 / concealcursor=""`（实测 `conceallevel=3`）。两者都在动同一组窗口选项，建议用 `:RenderLatex doctor` 确认，并把 LaTeX 渲染收敛到其中一个插件。

### 4.7 未覆盖的能力盘点

按「当前配置里有没有显式配置」统计（出现次数为 0 表示没写，但**不代表不可用**——部分已由 0.12 内建提供）：

| 能力 | 配置中出现次数 | 实际可用性 |
|---|---|---|
| 格式化 | **0** | ❌ 不可用。`ty` 不支持 formatting；需要 `vim.lsp.buf.format` + `ruff` |
| inlay hints | **0** | ❌ 不可用（需显式开启） |
| signature help | **0** | ⚠️ 内建 `i/s <C-S>` 可用；blink 的 `<C-k>` 未开（`signature.enabled` 默认 false） |
| 重命名 | **0** | ✅ 内建 `grn` 可用 |
| code action | **0** | ✅ 内建 `gra` 可用 |
| hover | 0（1 处是注释掉的） | ✅ 内建 buffer-local `K` 可用（见 4.3） |
| 文档符号 | **0** | ✅ 内建 `gO` 可用 |
| 诊断跳转 | 2（且已弃用） | ✅ 内建 `]d`/`[d`/`]D`/`[D`/`<C-W>d` 可用（建议删掉那 2 行） |
| 注释 | mini.comment | ✅ 内建 `gc`/`gcc`/`x gc` 也可用（见 4.8） |

- **`:checkhealth` 未纳入日常流程**：本次审计发现的问题里有 3 个（`auto_start = "latex"`、`undofile`、`winborder`）都能通过定期 `:checkhealth` + 选项体检发现，建议在 README 里加一节「维护」。

### 4.8 `mini.comment` 在 Neovim 0.12 已属可选

Neovim 0.12 内建了注释功能（`runtime/lua/vim/_core/defaults.lua:177-191`）：

- `n gcc` → 注释当前行
- `n/x gc{motion}` → 注释动作范围
- `x gc` → 注释选区
- `o gc` → 注释 textobject

实测（纯 `-u NONE`）：

```
plain gcc      -> { "# print(1)", "print(2)" }
plain vis gc   -> { "# print(1)", "# print(2)" }
```

所以 `mini.comment` 的**唯一增量**就是 `<leader>c` 这个额外键位（以及它自己的 textobject 实现）。当前状态是：

| 键位 | 来源 | 行为 |
|---|---|---|
| `gcc` / `gc{motion}` | 内建 | ✅ 正常 |
| `x gc` | ~~内建~~ → mini.comment | ❌ 被劫持（P0-4） |
| `<leader>c` | mini.comment | ✅ 正常 |

**两个可选方向**：

- **A. 保留 mini.comment**：修好 `textobject`（P0-4），并接受 `gc` 与 `<leader>c` 两套键位并存。
- **B. 去掉 mini.comment**：删掉 `lua/plugins/mini-comment.lua` 与 `lua/config/mini-comment.lua`，用内建 `gc`/`gcc`/`x gc`，需要 `<leader>c` 再补两行 `vim.keymap.set`（映射到 `gcc` / `gc`）。少一个插件、少一个维护点。

考虑到本仓库的目标是「长期可维护」，B 更干净；若 `<leader>c` 的手感很重要，A 也行，但建议把 `textobject` 顺手修对。

### 4.9 `ty` 的能力边界（Python 唯一 LSP 的风险）

README 写「使用 `ty` 作为 lsp 和语法检查器。不推荐使用其他 lsp」。核对 ty 官方文档后，有几点需要知情：

| 能力 | ty | 说明 |
|---|---|---|
| definition / references / hover / rename / diagnostic | ✅ | 日常够用 |
| inlayHint | ✅ | 但当前配置没有开 |
| **implementation** | ❌ | astral-sh/ty#3514 → `gi` / `gri` 在 Python 下无输出 |
| **formatting / rangeFormatting** | ❌ | 官方明确 "Use Ruff for formatting" |
| codeLens / documentColor / documentLink | ❌ | 影响不大 |

另外 ty 目前是 **beta（0.0.x）**，官方声明「无稳定 API，任意两个版本之间都可能出现破坏性变更」。这对「长期可维护」是个现实风险。

**建议**：
1. 若需要格式化（强烈建议），**同时启用 `ruff`**（ty + ruff 是上游推荐组合，不是二选一）：
   ```lua
   vim.lsp.config('ruff', {})        -- lspconfig 已提供 lsp/ruff.lua
   vim.lsp.enable('ruff')
   ```
   并从 Mason 安装 `ruff`（当前 `~/.local/share/nvim/mason/bin/` 只有 `rust-analyzer` 和 `ty`）。
2. 在 README 里把「不推荐使用其他 lsp」改成更准确的表述：ty 负责类型检查/诊断，ruff 负责格式化与 lint，两者互补。

---

## 5. 文档与安装脚本漂移

### 5.1 `README.md`

| 行 | 现状 | 实际 |
|---|---|---|
| 45-46 | `space+space` / `space+enter` 运行 cell（quench） | quench 已移除（commit `f205c21 remove support for jupytext`） |
| 55-56 | `ctrl+h/l` 轮换 buffer、`space+w` 关闭 buffer（barbar） | barbar 未安装 |
| 35 | `space+o` 触发代码大纲（outline） | 实际是 `AerialToggle!` |
| 57 | `gd/gi/gr` 原生跳转 | 实际是 goto-preview |
| 58 | `space+gd/gi/gr` 跳转预览 | 实际 preview 绑在裸 `gd/gi/gr/gt` |
| 65-66 | `]d/[d` 诊断（blink-cmp） | 实际来自 `lua/lsp.lua`（`vim.diagnostic`），与 blink 无关 |
| 37 | `space+d` 诊断（blink-cmp + telescope） | blink-cmp 不提供诊断；应为 telescope |

另外 README 完全没有覆盖 `<leader>u`（当前是坏的）、`<leader>p`/`<leader>r`（gitsigns）、`<leader>;`/`[;`/`];`（dropbar）、`s`/`S`/`r`/`R`（flash）、`<leader>c`（mini.comment）、`<C-\>`（toggleterm）等。

**建议**：README 的 Key Mapping 表改为从 `desc` 生成或手工同步，并删掉已移除插件的行。

### 5.2 `install.sh`

- 第 441 行安装后提示 `1. 打开 nvim，运行 :UpdateRemotePlugins（quench.nvim 需要）` —— quench 已移除，此步骤可删。
- 第 376 行安装 `pynvim jupyter-client aiohttp websockets ipykernel` —— 这是 quench 的 Jupyter 集成依赖，现在已不需要（如果不再用 nvim 内跑 notebook）。
- 第 263-265 行 `--clean` 会 `rm -rf ~/.local/share/nvim`，即删除已安装插件（下次启动会全部重装）。这是「clean」的语义，可以接受，但建议在 `--help` 里提示代价。

---

## 6. 清理项

| 项 | 说明 |
|---|---|
| `~/.local/share/nvim/site/pack/core/opt/`（空目录） | `checkhealth lazy` 报 warning；来自旧的 `:packadd` / packer 时代残留 |
| `~/.cache/nvim/math-conceal.nvim/` | 已移除插件的缓存 |
| `~/.cache/nvim/catppuccin/` | catppuccin 未被使用 |
| `.gitignore` | 只有 `.codegraph/`；建议加 `nvim.log`、`*.out`（便于以后做类似审计） |
| lazy.nvim `rocks` | 无插件依赖 luarocks，可 `rocks = { enabled = false }` 消除 checkhealth 噪音 |

### 6.1 依赖新鲜度

`lazy-lock.json` 是「钉版本」的好习惯，但从本机安装状态看，**有若干插件停在 2024 年的提交**：

```
night-owl.nvim     2024-09-11     ← 最旧
toggleterm.nvim    2024-12-30
neotab.nvim        2025-08-04
telescope-file-browser.nvim 2025-08-05
...
render-markdown.nvim / nvim-lspconfig / mason-lspconfig  2026-08/09  ← 最新
```

这里有两种可能，**离线无法区分**（本机 `git ls-remote` 被网络限制）：

1. 上游本身不活跃（例如 colorscheme 类插件常年不更新是正常的）；
2. `lazy-lock.json` 陈旧，从上次 `:Lazy update` 之后上游已有大量更新。

**建议**：
- 在 README 的「维护」一节写明更新节奏：定期 `:Lazy update`（或 `:Lazy sync`），更新后 `:checkhealth` + 跑一次本报告的探针脚本。
- 本次审计的临时脚本已删除，但附录 A 给了复现方法；建议把它固化成仓库里的 `scripts/audit.lua`，这样每次更新后都能低成本回归。
- 特别关注 `nvim-treesitter`：它按 release 钉住 parser revision，`build = ":TSUpdate"` 已经在做正确的事，但如果你升级了 Neovim 大版本，务必确认 ABI（`:checkhealth vim.treesitter` 会报）。

---

## 7. 建议的落地顺序

1. **P0 Bug 修复**（1.1–1.11）——都是小改动、零风险，先做。其中 1.4 / 1.9 / 1.11 还顺带恢复内建功能。
2. **删除死代码/重复**：nvim-lspconfig `opts`、`lsp.lua` 的 `]d`/`[d`（改用内建）、`cmp.entry.get_documentation`、catppuccin spec、outline 或 aerial 二选一、重复 `<leader>b`、未使用变量。
3. **统一风格**：加 `.stylua.toml` + `.editorconfig`，统一缩进/引号/注释语言，统一命名。
4. **补核心选项**（4.1）：`undofile`、`scrolloff`、`signcolumn`、`winborder`、`timeoutlen` 等。
5. **补 LSP 能力**：`ruff` + format on save、inlay hints；把 goto-preview 移出 `gr`/`gi`/`gt`（注意 `<leader>g` 已被 lazygit 占用）。
6. **blink.cmp 调优**（4.4）。
7. **决定 `mini.comment` 去留**（4.8）与 `aerial`/`outline` 去留。
8. **文档同步**：README + install.sh。
9. **清理**（第 6 节）。

---

## 附录 A：取证方法与命令

本次审计用真实配置跑了 10 个 headless 探针脚本 + 1 次 `:checkhealth` 批量抓取。脚本已一并删除，核心方法如下（可复现）：

```bash
export PATH="/data1T/home/csy/pkgs/spack/opt/spack/linux-zen2/neovim-0.12.4-z7bn36s4uf7gtyj2o7iru5tbombshqbg/bin:$PATH"
cd /data1T/home/csy/pkgs/nvim-dotfiles/nvim

# 1) 加载真实配置并执行一个探针脚本，然后退出
nvim --headless -u init.lua "+lua dofile('probe.lua')" "+qa!" < /dev/null

# 2) 注意：脚本必须自己写文件落盘（headless 看不到 print）
#    且需 vim.o.swapfile=false / vim.o.shadafile="NONE" 以避免沙箱只读报错
# 3) 需要 nvim 写 ~/.cache/nvim 与 ~/.local/state/nvim 时（如 :checkhealth、
#    内建 vim._comment、telescope 命令），沙箱需放宽到 danger-full-access
```

关键探针手法：

| 目的 | 手法 |
|---|---|
| 键位归属 | `vim.fn.maparg(lhs, mode, false, true)` → `sid` 负值=内建，`callback` + `debug.getinfo` 定位来源脚本 |
| 映射 rhs 真实行为 | `nvim_feedkeys(nvim_replace_termcodes(rhs, true, false, true), "mx", false)` |
| 弃用告警 | 覆盖 `vim.deprecate` 记录 `name → alt (removal version)` |
| treesitter 是否启动 | `vim.treesitter.highlighter.active[buf] ~= nil` |
| 插件是否加载 | `require("lazy.core.config").plugins[name]._.loaded` + `User LazyLoad` autocmd |
| 配置项生效值 | `vim.diagnostic.config()` / `vim.o[opt]` / `vim.g.*` |

## 附录 B：运行时关键数据（实测）

```
NVIM v0.12.4  |  lazy.nvim 11.17.5  |  blink.cmp v1.10.2  |  nvim-lspconfig v2.11.0
                 render-markdown v8.14.0  |  render-latex v0.1.0-rc4  |  treesitter main (8b98b447)

treesitter parsers: lua python rust markdown markdown_inline vimdoc query html latex yaml  (all OK)
checkhealth: lazy 3 warn/1 error(luarocks，可忽略) | lspconfig ✅(已被官方移除) | vim.treesitter ✅
             mason 8 warn(缺 go/php/java... 与本配置无关) | blink.cmp ✅

运行时选项: undofile=false scrolloff=0 signcolumn=auto winborder="" timeoutlen=1000
           laststatus=2 pumheight=0 confirm=false updatetime=300 clipboard=unnamedplus
           foldmethod=manual foldlevel=99

运行时映射(实测归属):
  <leader>u   → "Telescope git_status<CR>"        ❌ 坏（缺 :）
  <M-Left>    → ":vetical resize -2<CR>"          ❌ 坏（拼写 + 覆盖了 b）
  <leader>o   → AerialToggle!                     ⚠️ outline 的 keys 被遮蔽
  gr/gd/gi/gt → goto-preview                      ⚠️ 遮蔽原生 gi / gt
  [d/]d       → lsp.lua (vim.diagnostic.goto_*)   ⚠️ 已弃用+多余
  x gc        → MiniComment.textobject()          ❌ 劫持了内建可视注释
  n gcc/n gc  → 内建 vim._comment                 ✅
  K           → (LspAttach 时内建 buffer-local)   ✅
  ]d/[d/]D/[D/<C-W>d, grn/gra/grx/grr/gri/grt/gO  ✅ 内建
  <Tab>/<S-Tab> → blink(菜单) / neotab(fallback)  ⚠️ 隐式依赖注册顺序

布局探针: ft for x.tex = "plaintex"（内容含 LaTeX 时 "tex"），
          tex buffer treesitter active = false / python = true   ❌ 确认 P0-9
          visualmode() 一次 v 之后 = "v"（不再回空）             ❌ 确认 P0-3
```
