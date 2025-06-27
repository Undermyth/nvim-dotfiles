local status, aerial = pcall(require, "aerial")
if not status then
	vim.notify("aerial not found")
	return
end

aerial.setup({
    on_attach = function(bufnr)
        -- Jump forwards/backwards with '{' and '}'
        vim.keymap.set('n', '{', '<cmd>AerialPrev<CR>', { buffer = bufnr })
        vim.keymap.set('n', '}', '<cmd>AerialNext<CR>', { buffer = bufnr })
    end
})

vim.keymap.set("n", "<leader>o", "<cmd>AerialToggle!<CR>")
