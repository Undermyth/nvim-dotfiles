return {
    'lewis6991/gitsigns.nvim',
    config = function()
        vim.keymap.set('n', '<leader>p', '<cmd>lua require("gitsigns").preview_hunk()<CR>', { silent = true })
        vim.keymap.set('n', '<leader>r', '<cmd>lua require("gitsigns").reset_hunk()<CR>', { silent = true })
        require("gitsigns").setup({
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
        })
    end
}
