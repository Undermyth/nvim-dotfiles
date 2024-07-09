local status, toggleterm = pcall(require, "toggleterm")
if not status then
	vim.notify("toggleterm not found")
	return
end

toggleterm.setup({
    open_mapping = [[<leader>t]],
    start_in_insert = true,
    direction = 'horizontal'
})
