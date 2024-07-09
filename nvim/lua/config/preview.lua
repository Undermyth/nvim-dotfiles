local status, preview = pcall(require, "goto-preview")
if not status then
	vim.notify("preview not found")
	return
end

vim.keymap.set('n', '<leader>gd', "<cmd>lua require('goto-preview').goto_preview_definition()<CR>")
vim.keymap.set('n', '<leader>gt', "<cmd>lua require('goto-preview').goto_preview_type_definition()<CR>")
vim.keymap.set('n', '<leader>gi', "<cmd>lua require('goto-preview').goto_preview_implementation()<CR>")
vim.keymap.set('n', '<leader>gr', "<cmd>lua require('goto-preview').goto_preview_references()<CR>")

preview.setup({

})
