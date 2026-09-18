return {
    "techwizrd/render-latex.nvim",
    ft = "markdown",
    opts = {
        render = {
            preset = "match_text", -- "compact" or "presentation"
            inline = "conceal", -- "content", "highlight", or false
            inline_symbols = true,
            live_preview = true,
            hide_on_cmdline = false,
        },
    },
}
