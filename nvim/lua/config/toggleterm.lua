local status, toggleterm = pcall(require, "toggleterm")
if not status then
	vim.notify("toggleterm not found")
	return
end

vim.keymap.set('n', '<leader>t', "<cmd>ToggleTerm<CR>")

toggleterm.setup({
    open_mapping = [[<C-\>]],
    size = 100,
    start_in_insert = true,
    direction = 'vertical',
    float_opts = {
        border = "curved",
        title_pos = "center",
    },
})
