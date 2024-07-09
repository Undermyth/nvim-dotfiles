local status, lspfuzzy = pcall(require, "lspfuzzy")
if not status then
	vim.notify("lspfuzzy not found")
	return
end

vim.keymap.set('n', '<leader>gd', "<cmd>lua vim.lsp.buf.definition()<CR>")
vim.keymap.set('n', '<leader>gr', "<cmd>lua vim.lsp.buf.references()<CR>")

lspfuzzy.setup({})
