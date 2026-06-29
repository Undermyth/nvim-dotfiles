#!/bin/bash
set -euo pipefail

# ============================================================
#  nvim-dotfiles — 一键安装脚本
#  用法:
#    ./install.sh                         复制 nvim 配置
#    ./install.sh --clean                 清理 + 复制 nvim 配置
#    ./install.sh --install-dependencies /path  安装所有依赖到指定目录
#    ./install.sh --clean --install-dependencies /path  全量安装
#    ./install.sh --agent-only           仅复制 agent 框架配置
#    ./install.sh --agents pi,claude      仅安装/复制指定的 agent
#    ./install.sh --install-dependencies /path --agents pi  仅安装 pi 依赖+配置
# ============================================================

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ----- 默认值 -------------------------------------------------
CLEAN=false
INSTALL_DEPS=false
DEP_PREFIX=""
SKIP_PYTHON=false
AGENT_ONLY=false
AGENTS=""            # 逗号分隔的 agent 列表，空 = 全部

# ----- 已知 agent 列表 -----------------------------------------
KNOWN_AGENTS="pi claude reasonix"

# ----- 参数解析 -----------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --clean)
            CLEAN=true
            shift
            ;;
        --install-dependencies)
            INSTALL_DEPS=true
            if [ -n "${2:-}" ] && [ "${2:0:1}" != "-" ]; then
                DEP_PREFIX="$2"
                shift 2
            else
                echo "❌ --install-dependencies 需要跟一个路径参数"
                echo "   示例: ./install.sh --install-dependencies ~/tools"
                exit 1
            fi
            ;;
        --skip-python)
            SKIP_PYTHON=true
            shift
            ;;
        --agent-only)
            AGENT_ONLY=true
            shift
            ;;
        --agents)
            if [ -n "${2:-}" ] && [ "${2:0:1}" != "-" ]; then
                AGENTS="$2"
                shift 2
            else
                echo "❌ --agents 需要跟一个逗号分隔的 agent 列表"
                echo "   可用 agent: pi, claude, reasonix"
                echo "   示例: ./install.sh --agents pi,claude"
                exit 1
            fi
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --clean                         清理旧的 nvim 配置和缓存，然后重新复制"
            echo "  --install-dependencies <路径>    下载并安装所有依赖到 <路径>/nvim-toolkits/"
            echo "  --skip-python                   跳过 Python 包安装（配合 --install-dependencies）"
            echo "  --agent-only                    仅复制 agent 框架配置（不处理 nvim/zellij）"
            echo "  --agents <列表>                  指定安装/配置的 agent，逗号分隔"
            echo "                                   可用: pi, claude, reasonix"
            echo "                                   默认: 全部"
            echo "  -h, --help                      显示此帮助"
            echo ""
            echo "示例:"
            echo "  $0                                          # 仅复制 nvim 配置"
            echo "  $0 --clean                                  # 干净地安装 nvim 配置"
            echo "  $0 --install-dependencies ~/tools            # 安装所有依赖"
            echo "  $0 --clean --install-dependencies ~/tools   # 全量安装"
            echo "  $0 --agent-only                             # 仅复制所有 agent 配置"
            echo "  $0 --agent-only --agents pi                 # 仅复制 pi 配置"
            echo "  $0 --install-dependencies ~/tools --agents pi,claude  # 仅安装 pi+claude"
            exit 0
            ;;
        *)
            echo "❌ 未知选项: $1"
            echo "   使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# ----- 解析 AGENTS 列表 ---------------------------------------
# 如果未指定 --agents，默认全部 agent
if [ -z "$AGENTS" ]; then
    AGENTS="$KNOWN_AGENTS"
fi

# 校验 agent 名称并转为数组
AGENT_ARRAY=()
IFS=',' read -ra RAW_AGENTS <<< "$AGENTS"
for a in "${RAW_AGENTS[@]}"; do
    # trim whitespace
    a="$(echo "$a" | xargs)"
    if [ -z "$a" ]; then
        continue
    fi
    # 校验是否为已知 agent
    valid=false
    for known in $KNOWN_AGENTS; do
        if [ "$a" = "$known" ]; then
            valid=true
            break
        fi
    done
    if [ "$valid" != true ]; then
        echo "❌ 未知 agent: '$a'"
        echo "   可用 agent: pi, claude, reasonix"
        exit 1
    fi
    AGENT_ARRAY+=("$a")
done

# 辅助函数：判断某个 agent 是否在列表中
agent_enabled() {
    local target="$1"
    for a in "${AGENT_ARRAY[@]}"; do
        if [ "$a" = "$target" ]; then
            return 0
        fi
    done
    return 1
}

# ============================================================
#  辅助函数
# ============================================================

download() {
    local url="$1" outfile="$2"
    echo "     下载 $(basename "$outfile") ..."
    if command -v curl &>/dev/null; then
        curl -fsSL "$url" -o "$outfile"
    elif command -v wget &>/dev/null; then
        wget -q "$url" -O "$outfile"
    else
        echo "❌ 需要 curl 或 wget 来下载文件"
        exit 1
    fi
}

# 从 tarball 中提取唯一的二进制文件到目标目录
# 适用于 rg, fd, fzf, lazygit, zellij 这类单二进制工具
extract_binary() {
    local tarball="$1" binary="$2" target="$3"
    local tmpdir
    tmpdir="$(mktemp -d)"
    tar xzf "$tarball" -C "$tmpdir"
    local found
    found="$(find "$tmpdir" -type f -name "$binary" 2>/dev/null | head -1)"
    if [ -z "$found" ]; then
        echo "❌ 在 $tarball 中找不到 $binary"
        rm -rf "$tmpdir"
        return 1
    fi
    mv "$found" "$target/$binary"
    chmod +x "$target/$binary"
    rm -rf "$tmpdir"
    echo "     ✓ $binary"
}

copy_config_dir() {
    local src="$1" dst="$2" name="$3"
    if [ -d "$dst" ]; then
        if [ "$CLEAN" = true ]; then
            rm -rf "$dst"
        else
            echo "    ⚠️  $dst 已存在，备份到 ${dst}.bak"
            rm -rf "${dst}.bak"
            mv "$dst" "${dst}.bak"
        fi
    fi
    mkdir -p "$(dirname "$dst")"
    cp -r "$src" "$dst"
    echo "     ✓ $name 配置 -> $dst"
}

copy_config_file() {
    local src="$1" dst="$2" name="$3"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "     ✓ $name 配置 -> $dst"
}

# ============================================================
#  Agent 配置拷贝函数
# ============================================================

copy_pi_config() {
    echo ""
    echo "  >> Pi Coding Agent 配置"
    copy_config_file "$REPO_DIR/pi/settings.json"      "$HOME/.pi/agent/settings.json"      "pi settings"
    copy_config_file "$REPO_DIR/pi/models.json"        "$HOME/.pi/agent/models.json"        "pi models"
    copy_config_file "$REPO_DIR/pi/APPEND_SYSTEM.md"   "$HOME/.pi/agent/APPEND_SYSTEM.md"   "pi system prompt"

    # 自制 extensions（能够整个目录拷贝的，就不逐文件拷贝）
    copy_config_dir "$REPO_DIR/pi/extensions/websearch"    "$HOME/.pi/agent/extensions/websearch"    "pi websearch"
    copy_config_dir "$REPO_DIR/pi/extensions/plan-mode"    "$HOME/.pi/agent/extensions/plan-mode"    "pi plan-mode"
    copy_config_dir "$REPO_DIR/pi/extensions/token-detail" "$HOME/.pi/agent/extensions/token-detail" "pi token-detail"
    copy_config_dir "$REPO_DIR/pi/extensions/cmd-helper"   "$HOME/.pi/agent/extensions/cmd-helper"   "pi cmd-helper"

    # questionaire 工具（单文件扩展）
    copy_config_file "$REPO_DIR/pi/extensions/questionaire.ts" "$HOME/.pi/agent/extensions/questionaire.ts" "pi questionaire"

    # subagent 扩展（子代理系统）
    copy_config_dir "$REPO_DIR/pi/extensions/subagent" "$HOME/.pi/agent/extensions/subagent" "pi subagent"

    # toolgate 扩展（权限门控系统）
    copy_config_dir "$REPO_DIR/pi/extensions/toolgate" "$HOME/.pi/agent/extensions/toolgate" "pi toolgate"
}

copy_claude_config() {
    echo ""
    echo "  >> Claude Code 配置"
    copy_config_file "$REPO_DIR/claude/settings.json" "$HOME/.claude/" "claude"
}

copy_reasonix_config() {
    echo ""
    echo "  >> Reasonix 配置"
    copy_config_file "$REPO_DIR/reasonix/config.toml" "$HOME/.config/reasonix/config.toml" "reasonix"
}

# ============================================================
#  第 1 阶段：清理
# ============================================================
if [ "$CLEAN" = true ]; then
    echo "🧹 清理旧的 nvim 配置和缓存..."
    rm -rf "$HOME/.config/nvim"
    rm -rf "$HOME/.local/share/nvim"
    rm -rf "$HOME/.local/state/nvim"
    echo "   完成"
fi

# ============================================================
#  第 2 阶段：安装依赖
# ============================================================
if [ "$INSTALL_DEPS" = true ]; then
    TOOLKIT_DIR="$DEP_PREFIX/nvim-toolkits"
    BIN_DIR="$TOOLKIT_DIR/bin"
    NVIM_DIR="$TOOLKIT_DIR/neovim"

    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  📦 安装依赖到: $TOOLKIT_DIR"
    echo "════════════════════════════════════════════════════"
    mkdir -p "$BIN_DIR" "$NVIM_DIR"

    # ----- 2.1 neovim v0.12.2 -----
    echo ""
    echo "  >> neovim v0.12.2"
    NVIM_TARBALL="nvim-linux-x86_64.tar.gz"
    download "https://github.com/neovim/neovim/releases/download/v0.12.2/$NVIM_TARBALL" "/tmp/$NVIM_TARBALL"
    tar xzf "/tmp/$NVIM_TARBALL" -C "$TOOLKIT_DIR"
    if [ -d "$TOOLKIT_DIR/nvim-linux-x86_64" ]; then
        rm -rf "$NVIM_DIR"
        mv "$TOOLKIT_DIR/nvim-linux-x86_64" "$NVIM_DIR"
    fi
    rm -f "/tmp/$NVIM_TARBALL"
    echo "     ✓ neovim ($NVIM_DIR/bin/nvim)"

    # ----- 2.2 独立二进制工具 -----
    echo ""
    echo "  >> ripgrep (rg)"
    download "https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep-15.1.0-x86_64-unknown-linux-musl.tar.gz" "/tmp/rg.tar.gz"
    extract_binary "/tmp/rg.tar.gz" "rg" "$BIN_DIR"
    rm -f "/tmp/rg.tar.gz"

    echo ""
    echo "  >> fd"
    download "https://github.com/sharkdp/fd/releases/download/v10.4.2/fd-v10.4.2-x86_64-unknown-linux-gnu.tar.gz" "/tmp/fd.tar.gz"
    extract_binary "/tmp/fd.tar.gz" "fd" "$BIN_DIR"
    rm -f "/tmp/fd.tar.gz"

    echo ""
    echo "  >> fzf v0.73.1"
    download "https://github.com/junegunn/fzf/releases/download/v0.73.1/fzf-0.73.1-linux_amd64.tar.gz" "/tmp/fzf.tar.gz"
    extract_binary "/tmp/fzf.tar.gz" "fzf" "$BIN_DIR"
    rm -f "/tmp/fzf.tar.gz"

    echo ""
    echo "  >> lazygit v0.62.2"
    download "https://github.com/jesseduffield/lazygit/releases/download/v0.62.2/lazygit_0.62.2_linux_x86_64.tar.gz" "/tmp/lazygit.tar.gz"
    extract_binary "/tmp/lazygit.tar.gz" "lazygit" "$BIN_DIR"
    rm -f "/tmp/lazygit.tar.gz"

    echo ""
    echo "  >> zellij v0.44.3"
    download "https://github.com/zellij-org/zellij/releases/download/v0.44.3/zellij-x86_64-unknown-linux-musl.tar.gz" "/tmp/zellij.tar.gz"
    extract_binary "/tmp/zellij.tar.gz" "zellij" "$BIN_DIR"
    rm -f "/tmp/zellij.tar.gz"

    # ----- 2.3 Agent 框架安装 -----
    if agent_enabled "reasonix"; then
        echo ""
        echo "  >> reasonix (DeepSeek-Reasonix)"
        download "https://github.com/esengine/DeepSeek-Reasonix/releases/download/v1.2.0/reasonix-linux-amd64.tar.gz" "/tmp/reasonix.tar.gz"
        extract_binary "/tmp/reasonix.tar.gz" "reasonix" "$BIN_DIR"
        rm -f "/tmp/reasonix.tar.gz"
    else
        echo ""
        echo "  ⏭️  跳过 reasonix (未在 --agents 中指定)"
    fi

    if agent_enabled "claude"; then
        echo ""
        echo "  >> Claude Code"
        curl -fsSL https://claude.ai/install.sh | bash
    else
        echo ""
        echo "  ⏭️  跳过 Claude Code (未在 --agents 中指定)"
    fi

    if agent_enabled "pi"; then
        echo ""
        echo "  >> Pi Coding Agent"
        curl -fsSL https://pi.dev/install.sh | sh
    else
        echo ""
        echo "  ⏭️  跳过 Pi Coding Agent (未在 --agents 中指定)"
    fi

    # ----- 2.4 Python 包 -----
    echo ""
    echo "  >> Python 包"
    if [ "$SKIP_PYTHON" = true ]; then
        echo "    ⏭️  --skip-python 已指定，跳过"
    elif ! command -v python3 &>/dev/null; then
        echo "    ⚠️  未发现 python3，跳过 Python 包安装"
    else
        PIP_CMD="pip3"
        if ! command -v pip3 &>/dev/null; then
            if python3 -m pip --version &>/dev/null; then
                PIP_CMD="python3 -m pip"
            else
                echo "    ⚠️  未发现 pip3，跳过 Python 包安装"
                echo "       (使用 --skip-python 可抑制此警告)"
                PIP_CMD=""
            fi
        fi
        if [ -n "${PIP_CMD:-}" ]; then
            echo "    安装 pynvim, jupyter-client, aiohttp, websockets, ipykernel ..."
            $PIP_CMD install --user --quiet pynvim jupyter-client aiohttp websockets ipykernel
            echo "     ✓ Python 包安装完成"
        fi
    fi

    # ----- 2.5 配置 ~/.bashrc -----
    echo ""
    echo "  >> 配置 ~/.bashrc"
    BASHRC="$HOME/.bashrc"
    MARKER_START="# >>> nvim-toolkits config >>>"
    MARKER_END="# <<< nvim-toolkits config <<<"

    touch "$BASHRC"
    if grep -qF "$MARKER_START" "$BASHRC" 2>/dev/null; then
        sed -i "/^$(echo "$MARKER_START" | sed 's/[\/&]/\\&/g')/,/^$(echo "$MARKER_END" | sed 's/[\/&]/\\&/g')/d" "$BASHRC"
    fi

    {
        echo ""
        echo "$MARKER_START"
        echo "# 以下由 nvim-dotfiles install.sh 自动添加"
        echo ""
        echo "# PATH: 加入 nvim-toolkits 中的二进制"
        echo "export PATH=\"$TOOLKIT_DIR/bin:$TOOLKIT_DIR/neovim/bin:\$PATH\""
        echo ""
        echo "# fzf 键盘绑定与补全"
        echo "if command -v fzf &>/dev/null; then"
        echo "    eval \"\$(fzf --bash 2>/dev/null)\" 2>/dev/null || true"
        echo "fi"
        echo ""
        echo "# nvim 简写"
        echo "alias nv=nvim"
        echo ""
        echo "$MARKER_END"
    } >> "$BASHRC"
    echo "     ✓ ~/.bashrc 已更新"
    echo "       (请运行 source ~/.bashrc 或重新登录以生效)"

    # ----- 2.6 拷贝配置文件 -----
    echo ""
    echo "  >> 拷贝配置文件"
    copy_config_dir "$REPO_DIR/nvim" "$HOME/.config/nvim" "nvim"
    copy_config_file "$REPO_DIR/zellij/config.kdl" "$HOME/.config/zellij/config.kdl" "zellij"

    if agent_enabled "reasonix"; then
        copy_reasonix_config
    fi
    if agent_enabled "claude"; then
        copy_claude_config
    fi
    if agent_enabled "pi"; then
        copy_pi_config
    fi
    # wezterm 配置由用户自行管理，不在此处理

    # ----- 2.7 安装后提醒 -----
    echo ""
    echo "  >> 安装后提醒"
    cat << 'EOF'

  ┌─────────────────────────────────────────────────────────┐
  │ 📋 还需要手动完成以下操作：                             │
  │                                                         │
  │  1. 打开 nvim，运行 :UpdateRemotePlugins                │
  │     （quench.nvim 需要）                                │
  │                                                         │
  │  2. 设置 LLM API key 环境变量：                         │
  │     export DEEPSEEK_API_KEY="sk-..."                    │
  │     （reasonix / claude / pi 需要）                     │
  │                                                         │
  │  3. 设置 XNG_KEY 环境变量                               │
  │     （MCP / websearch 需要）                            │
  │                                                         │
  │  4. 打开 nvim，运行 :Mason 安装所需 LSP                 │
  │                                                         │
  │  5. 运行 :checkhealth 验证安装                          │
  │                                                         │
  │  6. 运行 source ~/.bashrc 或重新登录终端                │
  └─────────────────────────────────────────────────────────┘

EOF

    echo ""
    echo "✅ 全部完成！依赖安装于: $TOOLKIT_DIR"
fi

# ============================================================
#  第 3 阶段：仅配置拷贝（当没有 --install-dependencies 时）
# ============================================================
if [ "$INSTALL_DEPS" != true ]; then
    echo ""
    if [ "$AGENT_ONLY" = true ]; then
        echo "════════════════════════════════════════════════════"
        echo "  📋 复制 agent 配置"
        echo "════════════════════════════════════════════════════"
        if agent_enabled "pi"; then
            copy_pi_config
        fi
        if agent_enabled "claude"; then
            copy_claude_config
        fi
        if agent_enabled "reasonix"; then
            copy_reasonix_config
        fi
    else
        echo "════════════════════════════════════════════════════"
        echo "  📋 复制 nvim/reasonix/zellij 配置"
        echo "════════════════════════════════════════════════════"
        copy_config_dir "$REPO_DIR/nvim" "$HOME/.config/nvim" "nvim"
        copy_config_file "$REPO_DIR/zellij/config.kdl" "$HOME/.config/zellij/config.kdl" "zellij"
        if agent_enabled "reasonix"; then
            copy_reasonix_config
        fi
        if agent_enabled "claude"; then
            copy_claude_config
        fi
        if agent_enabled "pi"; then
            copy_pi_config
        fi
    fi
    echo "✅ 完成！"
fi
