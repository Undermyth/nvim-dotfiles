return {
    "lervag/vimtex",
    lazy = false,
    init = function()
        vim.g.vimtex_view_general_viewer = 'okular'
        vim.g.vimtex_view_general_options = [[--unique file:@pdf\#src:@line@tex]]
        vim.g.tex_flavor = "latex"
        vim.g.vimtex_quickfix_open_on_warning = 2
    end
}
