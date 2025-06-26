# nvim-dotfiles
我的 nvim 配置 / my configuration for neovim
仅限资源受限（尤其是内存受限）的远程机器上编辑代码使用。浏览代码仍然以 vscode 优先（
## 映射表
| 映射 Keymap | 功能 Function | 相关插件 Plugins |
| --- | --- | --- |
| ctrl + p | 文件名查找 | telescope |
| space + ff | 全局文本查找 | telescope |
| shift + tab | 窗口轮换（i/n模式均可） | 原生 |
| option + left / right | 向左/向右以词为单位移动（i/n模式均可） | 原生 |
| option + up / down | 移动到最上/最下（i模式） | 原生 |
| option + backspace | 以词为单位删除（i模式） | 原生 |
| ctrl + h / j / k / l | 上下左右移动光标（i模式） | 原生 |
| ctrl + h / l | 向左/向右轮换 buffer | barbar |
| space + w | 关闭 buffer | barbar |
| gc | 整块注释（光标选中）| comment |
| gcc | 注释当前行 | comment |
| space + t | 打开内置终端 | toggleterm |
| ctrl + \ | 打开/隐藏内置终端 | toggleterm |
| space + d | 显示/隐藏文件树 | nvim-tree |
| gd / gi / gr | 跳转到定义/实现/引用（def/impl/ref）| 原生 |
| spcae + gd / gi / gr | 跳转预览 | preview |
| 鼠标拖拉 | 调整窗口大小 | 原生 |
| y | 复制（光标选中） | 原生 |
| p | 粘贴（光标选中） | 原生 |
| space + ga | 接受行内编辑 | codecompanion |
| space + gr | 拒绝行内编辑 | codecompanion |
| :CodeCompanionChat | 启动 LLM 会话 | codecompanion | 
| ctrl + s | 在 LLM 会话中发送 prompt（send） | codecompanion |
| ctrl + k | 逐字接受行内补全 | windsurf |

## LSP 的使用
使用 `:Mason` 查找并使用 `i` 键安装对应语言的 LSP。

然后在 `lsp.lua`中照猫画虎即可。注意，`eusure_installed`中的名字对应的是`:Mason`中右侧的淡色标签。

Mason 是 LSP 的包管理系统，lspconfig 是 LSP 向 neovim 的接口系统。mason-lspconfig 是两者的桥梁，负责将 Mason 安装的 LSP 提供给 lspconfig 进行发现。

treesitter 完成的是 AST 的解析，提供语言相关的语法高亮和格式化。nvim-cmp 从 LSP 获得信息进行补全提示。
## 配置位置与结构
在`~/.config/nvim`下，看`install.sh`即可。内容模块化，应该也是比较清晰的。插件由 LazyVim 自动管理，一般情况下无需关心。使用`:Lazyvim`查看插件的管理状态或者更新插件。
## LLM 配置
由 codecompanion 和 windsurf 共同完成，后者负责行内补全，前者负责行内编辑和对话。前者接的是 openrouter，转接 gemini-2.5-flash。对话与编辑均是。key 通过环境变量保管。
## 其他
主题可以通过`:Telescope colorscheme`进行选择。但是想要永久生效，必须通过`colorscheme.lua`进行配置。

