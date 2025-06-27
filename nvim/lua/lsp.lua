-- lsp.lua

-- Mason setup (这部分是好的，保持不变)
require('mason').setup({
    ui = {
        icons = {
            package_installed = "✓",
            package_pending = "➜",
            package_uninstalled = "✗"
        }
    }
})

-- mason-lspconfig setup (这部分也是好的，保持不变)
require('mason-lspconfig').setup({
    -- 确保这些 LSP 已经通过 Mason 安装
    automatic_enable = true,
    ensure_installed = { 'pylsp', 'lua_ls', 'rust_analyzer' },
})

-- ===================================================================
-- LSP 通用配置 (这是核心修改区域)
-- ===================================================================

local lspconfig = require('lspconfig')

-- 定义通用的 on_attach 函数，用于所有 LSP
local on_attach = function(client, bufnr)
    -- 这个函数在你那里已经定义好了，内容保持不变
    -- Enable completion triggered by <c-x><c-o>
    vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')

    -- Keymaps
    local bufopts = { noremap = true, silent = true, buffer = bufnr }
    vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, bufopts)
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, bufopts)
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, bufopts)
    vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, bufopts)
    vim.keymap.set('n', '<leader>sh', vim.lsp.buf.signature_help, bufopts) -- 你的原来是空的，建议加一个 leader key
    vim.keymap.set('n', '<leader>wa', vim.lsp.buf.add_workspace_folder, bufopts)
    vim.keymap.set('n', '<leader>wr', vim.lsp.buf.remove_workspace_folder, bufopts)
    vim.keymap.set('n', '<leader>wl', function()
        print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, bufopts)
    vim.keymap.set('n', '<leader>D', vim.lsp.buf.type_definition, bufopts)
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, bufopts)
    vim.keymap.set('n', '<leader>ca', vim.lsp.buf.code_action, bufopts)
    vim.keymap.set('n', 'gr', vim.lsp.buf.references, bufopts)
    vim.keymap.set('n', '<leader>f', function() vim.lsp.buf.format { async = true } end, bufopts)
end

-- 全局诊断 Keymaps (这部分保持不变)
local opts = { noremap = true, silent = true }
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, opts)
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, opts)
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, opts)
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, opts)


-- 获取由 mason-lspconfig 管理的服务器列表
local servers = require('mason-lspconfig').get_installed_servers()

-- 遍历所有已安装的服务器并进行配置
for _, server_name in ipairs(servers) do
    lspconfig[server_name].setup({
        on_attach = on_attach,
        -- 对于 pylsp 的特殊配置可以放在这里
        settings = {
            pylsp = {
                plugins = {
                    -- 例如，如果你安装了 python-lsp-ruff，可以在这里启用
                    -- ruff = {
                    --     enabled = true
                    -- },
                    -- pycodestyle = {
                    --     enabled = false
                    -- }
                }
            }
        }
    })
end

-- [[ 注意 ]]
-- 上面的循环已经处理了 pylsp, lua_ls, rust_analyzer 的通用配置。
-- 你不再需要下面的独立配置了。
-- lspconfig.pylsp.setup({ ... }) -- 删除或注释掉这一整块
