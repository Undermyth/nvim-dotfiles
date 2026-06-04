-- Create keymapping
-- LspAttach: After an LSP Client performs "initialize" and attaches to a buffer.
vim.api.nvim_create_autocmd("LspAttach", {
	callback = function(args)
		local keymap = vim.keymap
		local lsp = vim.lsp
		local bufopts = { noremap = true, silent = true }

		keymap.set("n", "gr", lsp.buf.references, bufopts)
		keymap.set("n", "gd", lsp.buf.definition, bufopts)
        keymap.set("n", "gi", lsp.buf.implementation, bufopts)
	end,
})

-- 全局诊断 Keymaps (这部分保持不变)
local opts = { noremap = true, silent = true }
-- vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, opts)
vim.keymap.set('n', '[d', function() vim.diagnostic.goto_prev({ float = { border = "rounded" } }) end, opts)
vim.keymap.set('n', ']d', function() vim.diagnostic.goto_next({ float = { border = "rounded" } }) end, opts)
-- vim.keymap.set('n', '<leader>e', vim.diagnostic.setloclist, opts)

-- CursorHold: When the user doesn't press a key for the time specified with 'updatetime'
--             By default, `updatetime` is equal to 4000 ms
--
-- vim.api.nvim_create_autocmd("CursorHold", {
-- 	callback = function()
-- 		vim.diagnostic.open_float(nil, { focusable = false, source = "if_many" })
-- 	end,
-- })
