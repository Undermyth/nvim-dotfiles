local status, telescope = pcall(require, "telescope")
if not status then
	vim.notify("telescope not found")
	return
end

-- 查找文件
vim.keymap.set("n", "<C-p>", ":Telescope find_files<CR>")
-- 全局搜索
vim.keymap.set("n", "<C-f>", ":Telescope live_grep<CR>")
-- vim.keymap.set("i", "<C-p>", "<Esc>:Telescope find_files<CR>"))
-- vim.keymap.set("i", "<C-f>", "<Esc>:Telescope live_grep<CR>"))

telescope.setup({})
