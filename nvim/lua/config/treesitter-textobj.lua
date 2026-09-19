-- nvim-treesitter-textobjects (main branch).
-- The public API (select_textobject / goto_*) is unchanged from master; only
-- setup() moved options around: include_surrounding_whitespace now belongs
-- under `select` (at the top level it is silently ignored).
require("nvim-treesitter-textobjects").setup({
    select = {
        lookahead = true,
        include_surrounding_whitespace = false,
        selection_modes = {
            ["@parameter.outer"] = "v", -- charwise
            ["@function.outer"] = "V",  -- linewise
        },
    },
})

local select = require("nvim-treesitter-textobjects.select")
local move = require("nvim-treesitter-textobjects.move")

-- textobjects
vim.keymap.set({ "x", "o" }, "af", function() select.select_textobject("@function.outer", "textobjects") end)
vim.keymap.set({ "x", "o" }, "if", function() select.select_textobject("@function.inner", "textobjects") end)
vim.keymap.set({ "x", "o" }, "at", function() select.select_textobject("@class.outer", "textobjects") end)
vim.keymap.set({ "x", "o" }, "it", function() select.select_textobject("@class.inner", "textobjects") end)
vim.keymap.set({ "x", "o" }, "as", function() select.select_textobject("@local.scope", "locals") end)

-- move forward
vim.keymap.set({ "n", "x", "o" }, "]f", function() move.goto_next_start("@function.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "]t", function() move.goto_next_start("@class.outer", "textobjects") end)
-- a list combines multiple queries
vim.keymap.set({ "n", "x", "o" }, "]o", function() move.goto_next_start({ "@loop.inner", "@loop.outer" }, "textobjects") end)
-- queries from other groups (locals / folds) work too
vim.keymap.set({ "n", "x", "o" }, "]s", function() move.goto_next_start("@local.scope", "locals") end)
vim.keymap.set({ "n", "x", "o" }, "]z", function() move.goto_next_start("@fold", "folds") end)
vim.keymap.set({ "n", "x", "o" }, "]F", function() move.goto_next_end("@function.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "]T", function() move.goto_next_end("@class.outer", "textobjects") end)

-- move backward
vim.keymap.set({ "n", "x", "o" }, "[f", function() move.goto_previous_start("@function.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "[t", function() move.goto_previous_start("@class.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "[F", function() move.goto_previous_end("@function.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "[T", function() move.goto_previous_end("@class.outer", "textobjects") end)

-- go to start or end, whichever is closer
-- NOTE: `]d` / `[d` are left to Neovim 0.12's built-in diagnostic jumps.
vim.keymap.set({ "n", "x", "o" }, "]c", function() move.goto_next("@conditional.outer", "textobjects") end)
vim.keymap.set({ "n", "x", "o" }, "[c", function() move.goto_previous("@conditional.outer", "textobjects") end)
