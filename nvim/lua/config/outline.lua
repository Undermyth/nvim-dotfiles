local status, outline = pcall(require, "outline")
if not status then
	vim.notify("outline not found")
	return
end

vim.keymap.set("n", "<leader>l", "<cmd>Outline<CR>")

outline.setup({

})
