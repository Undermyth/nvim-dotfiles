return {
    'Bekaboo/dropbar.nvim',
    -- optional, but required for fuzzy finder support
    dependencies = {
         "nvim-treesitter/nvim-treesitter",
    },
    config = function()
        local dropbar = require('dropbar')
        dropbar.setup({
            menu = {
                win_configs = {
                    border = 'rounded',
                }
            }
        })
        local dropbar_api = require('dropbar.api')
        vim.api.nvim_set_hl(0, 'WinBar', { underline = true, --[[ 其他你想要的样式 ]] })
        vim.keymap.set('n', '<Leader>;', dropbar_api.pick, { desc = 'Pick symbols in winbar' })
        vim.keymap.set('n', '[;', dropbar_api.goto_context_start, { desc = 'Go to start of current context' })
        vim.keymap.set('n', '];', dropbar_api.select_next_context, { desc = 'Select next context' })
    end
}
