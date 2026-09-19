return {
    'Bekaboo/dropbar.nvim',
    -- optional, but required for fuzzy finder support
    dependencies = {
         "nvim-treesitter/nvim-treesitter",
    },
    opts = {
        menu = {
            win_configs = {
                border = 'rounded',
            }
        }
    },
    -- Extra wiring stays in `config` (not `keys`): dropbar owns the winbar, so a
    -- `keys` field would lazy-load it and leave the winbar empty until first use.
    config = function(_, opts)
        require('dropbar').setup(opts)
        local dropbar_api = require('dropbar.api')
        vim.api.nvim_set_hl(0, 'WinBar', { underline = true })
        vim.keymap.set('n', '<Leader>;', dropbar_api.pick, { desc = 'Pick symbols in winbar' })
        vim.keymap.set('n', '[;', dropbar_api.goto_context_start, { desc = 'Go to start of current context' })
        vim.keymap.set('n', '];', dropbar_api.select_next_context, { desc = 'Select next context' })
    end
}
