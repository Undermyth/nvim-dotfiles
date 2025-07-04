return {
    'milanglacier/minuet-ai.nvim',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function()
        require('minuet').setup {
            -- Your configuration options here
            virtualtext = {
                auto_trigger_ft = { '*' },
                keymap = {
                    -- accept whole completion
                    accept = nil,
                    -- accept one line
                    accept_line = nil,
                    -- accept n lines (prompts for number)
                    -- e.g. "A-z 2 CR" will accept 2 lines
                    accept_n_lines = nil,
                    -- Cycle to prev completion item, or manually invoke completion
                    prev = nil,
                    -- Cycle to next completion item, or manually invoke completion
                    next = nil
                    ,
                    dismiss = '<C-\'>',
                },
            },
            provider = 'openai_compatible',
            throttle = 500,
            debounce = 250,
            n_completions = 1,
            provider_options = {
                openai_compatible = {
                    api_key = 'OPENROUTER_API_KEY',
                    end_point = 'https://openrouter.ai/api/v1/chat/completions',
                    model = 'qwen/qwen-2.5-coder-32b-instruct',
                    name = 'OpenRouter',
                }
            },
        }
        vim.keymap.set('i', '<Tab>', function()
            local minuet_virtual = require('minuet.virtualtext')
            if minuet_virtual.action.is_visible() then
                minuet_virtual.action.accept()
            else
                -- vim.cmd('call feedkeys("\\<Tab>")')
                return vim.api.nvim_replace_termcodes('<Tab>', true, true, true)
            end
        end, { expr = true})
    end,
}
