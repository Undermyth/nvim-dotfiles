return {
    "kdheepak/lazygit.nvim",
    -- No `lazy = false` here: it would make the `cmd` / `keys` triggers below
    -- meaningless and force the plugin to load at startup.
    cmd = {
        "LazyGit",
        "LazyGitConfig",
        "LazyGitCurrentFile",
        "LazyGitFilter",
        "LazyGitFilterCurrentFile",
    },
    -- optional for floating window border decoration
    dependencies = {
        "nvim-telescope/telescope.nvim",
        "nvim-lua/plenary.nvim",
    },
    keys = {
        { "<leader>g", "<cmd>LazyGit<cr>", desc = "LazyGit" }
    },
    config = function()
        require("telescope").load_extension("lazygit")
    end,
}
