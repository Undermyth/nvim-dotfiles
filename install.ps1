#!/usr/bin/env pwsh
<#
.SYNOPSIS
  nvim-dotfiles — Windows agent 配置安装脚本

.DESCRIPTION
  将仓库中的 agent 框架配置（pi / claude / reasonix）复制到 Windows 本机目录。
  仅处理配置拷贝，不涉及依赖安装或 nvim/zellij 等配置。

.PARAMETER Agents
  逗号分隔的 agent 列表，可用值: pi, claude, reasonix
  默认: 全部

.PARAMETER Clean
  清理旧的配置后再复制（会先备份到 .bak）

.PARAMETER Help
  显示帮助信息

.EXAMPLE
  .\install.ps1                       # 安装所有 agent 配置
  .\install.ps1 -Agents pi            # 仅安装 pi 配置
  .\install.ps1 -Agents pi,claude     # 仅安装 pi 和 claude
  .\install.ps1 -Clean                # 清理后安装所有 agent 配置
  .\install.ps1 -Agents pi -Clean     # 清理后仅安装 pi
#>

param(
  [string]$Agents = "",
  [switch]$Clean,
  [switch]$Help
)

# ----- 帮助 ----------------------------------------------------
if ($Help) {
  Write-Host @"
用法: .\install.ps1 [选项]

选项:
  -Agents <列表>  指定安装的 agent，逗号分隔
                  可用: pi, claude, reasonix
                  默认: 全部
  -Clean          清理旧配置后再复制（备份到 .bak）
  -Help           显示此帮助

示例:
  .\install.ps1                        # 全部
  .\install.ps1 -Agents pi             # 仅 pi
  .\install.ps1 -Agents pi,claude      # pi + claude
  .\install.ps1 -Clean                 # 清理 + 全部
"@
  exit 0
}

# ----- 路径 ----------------------------------------------------
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HomeDir = $env:USERPROFILE

# ----- 已知 agent ----------------------------------------------
$KnownAgents = @("pi", "claude", "reasonix")

# ----- 解析 Agents 参数 ----------------------------------------
if ([string]::IsNullOrWhiteSpace($Agents)) {
  $AgentList = $KnownAgents
}
else {
  $AgentList = $Agents.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}

# 校验
$InvalidAgents = $AgentList | Where-Object { $_ -notin $KnownAgents }
if ($InvalidAgents) {
  Write-Host "❌ 未知 agent: $($InvalidAgents -join ', ')" -ForegroundColor Red
  Write-Host "   可用 agent: $($KnownAgents -join ', ')" -ForegroundColor Yellow
  exit 1
}

# ----- 辅助函数 ------------------------------------------------
function Write-Step($Message) {
  Write-Host "`n  >> $Message" -ForegroundColor Cyan
}

function Copy-ConfigFile($Src, $Dst, $Label) {
  $dstDir = Split-Path $Dst -Parent
  if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
  }
  Copy-Item -Path $Src -Destination $Dst -Force
  Write-Host "     ✓ $Label -> $Dst" -ForegroundColor Green
}

function Copy-ConfigDir($Src, $Dst, $Label) {
  if (Test-Path $Dst) {
    if ($Clean) {
      Remove-Item -Recurse -Force $Dst
      Write-Host "     🧹 已清理 $Dst" -ForegroundColor Yellow
    }
    else {
      $backup = "$Dst.bak"
      if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
      Rename-Item -Path $Dst -NewName "$(Split-Path $Dst -Leaf).bak"
      Write-Host "     ⚠️  $Dst 已存在，备份到 $backup" -ForegroundColor Yellow
    }
  }
  $dstParent = Split-Path $Dst -Parent
  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  Copy-Item -Path $Src -Destination $Dst -Recurse -Force
  Write-Host "     ✓ $Label -> $Dst" -ForegroundColor Green
}

function Remove-IfExists($Path) {
  if (Test-Path $Path) {
    Remove-Item -Recurse -Force $Path
    Write-Host "     🧹 已清理 $Path" -ForegroundColor Yellow
  }
}

function Symlink-ConfigDir($Src, $Dst, $Label) {
  if (Test-Path $Dst) {
    if ($Clean) {
      Remove-Item -Recurse -Force $Dst
      Write-Host "     🧹 已清理 $Dst" -ForegroundColor Yellow
    }
    else {
      $backup = "$Dst.bak"
      if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
      Rename-Item -Path $Dst -NewName "$(Split-Path $Dst -Leaf).bak"
      Write-Host "     ⚠️  $Dst 已存在，备份到 $backup" -ForegroundColor Yellow
    }
  }
  $dstParent = Split-Path $Dst -Parent
  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  try {
    New-Item -ItemType SymbolicLink -Path $Dst -Target $Src -Force | Out-Null
    Write-Host "     ✓ $Label -> $Dst (软链接)" -ForegroundColor Green
  }
  catch {
    Write-Host "     ⚠️  无法创建软链接 (需要管理员权限或开发者模式)，回退为复制" -ForegroundColor Yellow
    Copy-Item -Path $Src -Destination $Dst -Recurse -Force
    Write-Host "     ✓ $Label -> $Dst (复制)" -ForegroundColor Green
  }
}

function Symlink-ConfigFile($Src, $Dst, $Label) {
  if (Test-Path $Dst) {
    if ($Clean) {
      Remove-Item -Force $Dst
      Write-Host "     🧹 已清理 $Dst" -ForegroundColor Yellow
    }
    else {
      $backup = "$Dst.bak"
      if (Test-Path $backup) { Remove-Item -Force $backup }
      Rename-Item -Path $Dst -NewName "$(Split-Path $Dst -Leaf).bak"
      Write-Host "     ⚠️  $Dst 已存在，备份到 $backup" -ForegroundColor Yellow
    }
  }
  $dstParent = Split-Path $Dst -Parent
  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  try {
    New-Item -ItemType SymbolicLink -Path $Dst -Target $Src -Force | Out-Null
    Write-Host "     ✓ $Label -> $Dst (软链接)" -ForegroundColor Green
  }
  catch {
    Write-Host "     ⚠️  无法创建软链接 (需要管理员权限或开发者模式)，回退为复制" -ForegroundColor Yellow
    Copy-Item -Path $Src -Destination $Dst -Force
    Write-Host "     ✓ $Label -> $Dst (复制)" -ForegroundColor Green
  }
}

# ----- 各 agent 安装函数 ----------------------------------------
function Install-Pi {
  Write-Step "Pi Coding Agent 配置"
  $piDir = "$HomeDir\.pi\agent"

  # 基础配置
  Copy-ConfigFile "$RepoDir\pi\settings.json"    "$piDir\settings.json"    "pi settings"
  Copy-ConfigFile "$RepoDir\pi\models.json"      "$piDir\models.json"      "pi models"
  Copy-ConfigFile "$RepoDir\pi\APPEND_SYSTEM.md" "$piDir\APPEND_SYSTEM.md" "pi system prompt"

  # 自制 extensions（整个目录软链接）
  Symlink-ConfigDir "$RepoDir\pi\extensions" "$piDir\extensions" "pi extensions"
}

function Install-Claude {
  Write-Step "Claude Code 配置"
  $claudeDir = "$HomeDir\.claude"
  Symlink-ConfigFile "$RepoDir\claude\settings.json" "$claudeDir\settings.json" "claude"
}

function Install-Reasonix {
  Write-Step "Reasonix 配置"
  $reasonixDir = "$HomeDir\.config\reasonix"
  Symlink-ConfigFile "$RepoDir\reasonix\config.toml" "$reasonixDir\config.toml" "reasonix"
}

# ============================================================
#  主流程
# ============================================================
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  📋 安装 Agent 配置" -ForegroundColor Magenta
Write-Host "  仓库: $RepoDir" -ForegroundColor DarkGray
Write-Host "  Agent: $($AgentList -join ', ')" -ForegroundColor DarkGray
if ($Clean) { Write-Host "  模式: 清理 + 复制" -ForegroundColor DarkGray }
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Magenta

# ----- Clean 模式：删除旧配置（不移除用户数据目录） -----------
if ($Clean) {
  Write-Host "`n🧹 清理旧配置..." -ForegroundColor Yellow
  if ("pi" -in $AgentList) {
    Remove-IfExists "$HomeDir\.pi\agent\settings.json"
    Remove-IfExists "$HomeDir\.pi\agent\models.json"
    Remove-IfExists "$HomeDir\.pi\agent\APPEND_SYSTEM.md"
    Remove-IfExists "$HomeDir\.pi\agent\extensions"
  }
  if ("claude" -in $AgentList) {
    Remove-IfExists "$HomeDir\.claude"
  }
  if ("reasonix" -in $AgentList) {
    Remove-IfExists "$HomeDir\.config\reasonix"
  }
  Write-Host "   完成" -ForegroundColor Green
}

# ----- 安装 --------------------------------------------------
if ("pi" -in $AgentList) { Install-Pi }
if ("claude" -in $AgentList) { Install-Claude }
if ("reasonix" -in $AgentList) { Install-Reasonix }

Write-Host "`n✅ 完成！" -ForegroundColor Green
