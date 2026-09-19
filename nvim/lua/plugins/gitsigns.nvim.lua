return {
    'lewis6991/gitsigns.nvim',
    opts = {
        current_line_blame = true,
        current_line_blame_opts = {
            virt_text = true,
            virt_text_pos = 'eol', -- 'eol' is more readeable when diff is in the last line
            delay = 1000,
            ignore_whitespace = false,
        },
        preview_config = {
            border = 'rounded',
        }
    },
    -- Keys live here (not in `keys`) on purpose: a `keys` field would turn this
    -- spec into a lazy-loaded one, and gitsigns must be loaded at startup so its
    -- signs show up in every buffer.
    config = function(_, opts)
        require("gitsigns").setup(opts)
        vim.keymap.set('n', '<leader>p', function() require("gitsigns").preview_hunk() end,
            { silent = true, desc = "Preview hunk" })
        vim.keymap.set('n', '<leader>r', function() require("gitsigns").reset_hunk() end,
            { silent = true, desc = "Reset hunk" })
    end
}
