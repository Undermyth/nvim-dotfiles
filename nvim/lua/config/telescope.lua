local status, telescope = pcall(require, "telescope")
if not status then
	vim.notify("telescope not found")
	return
end
local action_state = require('telescope.actions.state')
local actions = require('telescope.actions')

-- 查找文件
vim.keymap.set("n", "<C-p>", ":Telescope find_files<CR>")
vim.keymap.set("n", "<leader>f", ":Telescope find_files<CR>")
-- 全局搜索
vim.keymap.set("n", "<leader>/", "<Esc>:Telescope live_grep<CR>")
-- 符号列表
vim.keymap.set("n", "<leader>s", ":Telescope aerial<CR>")
-- 文件树
vim.keymap.set("n", "<leader>e", ":Telescope file_browser<CR>")
-- 诊断
vim.keymap.set("n", "<leader>d", ":Telescope diagnostics<CR>")

-- 将 Ctrl-Tab 映射到 Telescope 的 buffer 列表
-- `sort_mru = true` 是默认值，所以通常不用显式写出
vim.keymap.set('n', '<Tab>', function()
    require('telescope.builtin').buffers({
        sort_mru = true,
        ignore_current_buffer = false,
        attach_mappings = function(prompt_bufnr, map)
            map('n', 'd', function() actions.delete_buffer(prompt_bufnr) end)
            return true
        end
    })
end, { noremap = true, silent = true, desc = "Switch Buffers (MRU)" })

telescope.setup({
    pickers = {
        find_files = {
            no_ignore = true
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
	file_browser = {
	      hijack_netrw = true
	}
    },
})

telescope.load_extension("aerial")
telescope.load_extension("file_browser")
