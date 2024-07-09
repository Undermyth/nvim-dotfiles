local status, toggleterm = pcall(require, "toggleterm")
if not status then
	vim.notify("toggleterm not found")
	return
end

vim.keymap.set('n', '<leader>t', "<cmd>ToggleTerm<CR>")

toggleterm.setup({
    open_mapping = [[<C-\>]],
    start_in_insert = true,
    direction = 'horizontal'
})
