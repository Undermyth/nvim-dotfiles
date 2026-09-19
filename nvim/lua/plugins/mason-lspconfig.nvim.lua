return {
    "mason-org/mason-lspconfig.nvim",
    dependencies = {
        "mason-org/mason.nvim",
        "neovim/nvim-lspconfig",
    },
    opts = {
        ensure_installed = { "ty", "rust_analyzer" },
        -- The enable list lives in lua/plugins/nvim-lspconfig.lua
        -- (`vim.lsp.enable`). With the upstream default (`true`), every server
        -- installed through :Mason would be enabled implicitly.
        automatic_enable = false,
    },
}
