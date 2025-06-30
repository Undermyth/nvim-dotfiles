-- 对错误警告的图标
vim.diagnostic.config({
    virtual_text = true,
    signs = {
        text = {
            [vim.diagnostic.severity.ERROR] = "",
            [vim.diagnostic.severity.WARN] = "",
            [vim.diagnostic.severity.INFO] = "󰋼",
            [vim.diagnostic.severity.HINT] = "󰌵",
        },
    },
    -- 在输入模式下也更新提示，设置为 true 也许会影响性能
    update_in_insert = true,
    float = { border = 'rounded' }
})

-- local signs = { Error = "", Info = "", Hint = "", Warn = "" }
-- for type, icon in pairs(signs) do
--     local hl = "DiagnosticSign" .. type
--     vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
-- end

-- vim.api.nvim_command("autocmd CursorHold,CursorHoldI * lua vim.lsp.diagnostic.show_line_diagnostics({border='rounded', focusable=false})")
