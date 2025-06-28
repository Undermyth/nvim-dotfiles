local status, telescope = pcall(require, "telescope")
if not status then
	vim.notify("telescope not found")
	return
end

-- 查找文件
vim.keymap.set("n", "<C-p>", ":Telescope find_files<CR>")
-- 全局搜索
vim.keymap.set("n", "<leader>f", "<Esc>:Telescope live_grep<CR>")
-- vim.keymap.set("i", "<C-p>", "<Esc>:Telescope find_files<CR>"))
-- vim.keymap.set("i", "<C-f>", "<Esc>:Telescope live_grep<CR>"))
vim.keymap.set("n", "<leader>s", ":Telescope aerial<CR>")

telescope.setup({
    pickers = {
        find_files = {
            no_ignore = true,
        }
    },
    extensions = {
        aerial = {
              -- Set the width of the first two columns (the second
              -- is relevant only when show_columns is set to 'both')
              col1_width = 4,
              col2_width = 30,
              -- How to format the symbols
              format_symbol = function(symbol_path, filetype)
                    if filetype == "json" or filetype == "yaml" then
                        return table.concat(symbol_path, ".")
                    else
                        return symbol_path[#symbol_path]
                    end
              end,
              -- Available modes: symbols, lines, both
              show_columns = "both",
        },
    },
})


telescope.load_extension("aerial")
