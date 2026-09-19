return {
    "neovim/nvim-lspconfig",

    -- Adding an LSP for a language (v2 API):
    -- 1. Use `:Mason` to install the server and add its name to
    --    `ensure_installed` in lua/plugins/mason-lspconfig.nvim.lua.
    -- 2. Add its name to the `vim.lsp.enable` list below. That list is the
    --    single source of truth: mason-lspconfig runs with
    --    `automatic_enable = false`, so a newly installed server is NOT
    --    enabled silently.
    -- 3. Per-server settings go through `vim.lsp.config('<name>', { ... })`;
    --    defaults live in nvim-lspconfig's `lsp/<name>.lua` (e.g. lsp/ty.lua).
    --
    -- NOTE: do NOT turn this into `opts = { ... }`. lazy.nvim would then call
    -- `require("lspconfig").setup()`, which is the deprecated v1 framework
    -- (nvim-lspconfig itself is fine; only that framework is deprecated).
    -- Likewise `lspconfig.<name>.setup({})` is a v1-only spelling.
    --
    -- Floating-window borders are handled globally by
    -- `vim.o.winborder = "rounded"` in lua/options.lua.
    config = function()
        vim.lsp.enable({ "rust_analyzer", "ty" })
    end,
}
