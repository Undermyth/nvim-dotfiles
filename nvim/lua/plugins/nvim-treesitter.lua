-- Parser/query installer (main branch, requires nvim 0.12+).
-- Highlighting & co. are wired up in lua/config/treesitter.lua.
return {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    build = ":TSUpdate",
    config = function()
        require("config.treesitter")
    end,
}
