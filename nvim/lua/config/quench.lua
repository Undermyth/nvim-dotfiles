-- Optional configuration
vim.g.quench_nvim_web_server_host = "127.0.0.1"
vim.g.quench_nvim_web_server_port = 18237

vim.api.nvim_create_autocmd("FileType", {
    pattern = "python",
    callback = function ()
        vim.keymap.set('n', '<leader><leader>', ':QuenchRunCell<CR>', opts)
        vim.keymap.set('n', '<leader><CR>', ':QuenchRunCellAdvance<CR>', opts)
    end
})
