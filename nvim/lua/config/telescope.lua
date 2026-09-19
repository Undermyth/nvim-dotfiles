local status, telescope = pcall(require, "telescope")
if not status then
	vim.notify("telescope not found")
	return
end
local action_state = require('telescope.actions.state')
local actions = require('telescope.actions')

-- 查找文件
vim.keymap.set("n", "<C-p>", "<cmd>Telescope find_files<CR>")
vim.keymap.set("n", "<leader>f", "<cmd>Telescope find_files<CR>")
-- 全局搜索
vim.keymap.set("n", "<leader>/", "<cmd>Telescope live_grep<CR>")
-- 符号列表
vim.keymap.set("n", "<leader>s", "<cmd>Telescope aerial<CR>")
-- 文件树
vim.keymap.set("n", "<leader>e", "<cmd>Telescope file_browser<CR>")
-- 诊断
vim.keymap.set("n", "<leader>d", "<cmd>Telescope diagnostics<CR>")
-- git status
vim.keymap.set("n", "<leader>u", "<cmd>Telescope git_status<CR>")

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
            hidden = true,
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
    opts = {
        defaults = {
            layout_strategy = "horizontal",
            sorting_strategy = "ascending",
            layout_config = { prompt_position = "top" },
            file_ignore_patterns = { "^.git/", "__pycache__" },
            vimgrep_arguments = { "rg", "--color=never", "--no-headings", "--with-filename",
                                "--line-number", "--column", "--smart-case", "--hidden" },
        }
    }
})

telescope.load_extension("aerial")
telescope.load_extension("file_browser")
