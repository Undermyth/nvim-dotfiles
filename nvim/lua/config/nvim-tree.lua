local status, nvim_tree = pcall(require, "nvim-tree")
if not status then
	vim.notify("nvim-tree not found")
	return
end

-- `<leader>b` is defined once, in lua/plugins/nvim-tree.lua's `keys` (which also
-- gives it a `desc` and lazy-loads the plugin). Do not map it here again.

nvim_tree.setup({
    sort_by = "case_sensitive",
    -- 不劫持 netrw，保留给 telescope-file-browser
    hijack_netrw = false,
    -- 是否显示 git 状态
    git = {
		enable = true,
	},
    filters = {
        enable = false,
    },
	-- 过滤文件
    view = {
	    -- 文件浏览器展示位置，左侧：left, 右侧：right
	    side = "left",
	    -- 行号是否显示
	    number = false,
	    relativenumber = false,
	    signcolumn = "yes", -- 显示图标
	    width = 30,
    },
    renderer = {
        group_empty = true,
    },
})
