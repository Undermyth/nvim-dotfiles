# nvim-dotfiles
我的 nvim 配置 / my configuration for neovim
仅限资源受限（尤其是内存受限）的远程机器上编辑代码使用。浏览代码仍然以 vscode 优先（
## 映射表
| 映射 Keymap | 功能 Function | 相关插件 Plugins |
| --- | --- | --- |
| ctrl + p | 文件名查找 | telescope |
| space + f | 全局文本查找 | telescope |
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
## LSP 的使用
使用 `:Mason` 查找并使用 `i` 键安装对应语言的 LSP。
然后在 `lsp.lua`中照猫画虎即可。注意，`eusure_installed`中的名字对应的是`:Mason`中右侧的淡色标签。
