local status, lualine = pcall(require, "lualine")
if not status then
	vim.notify("lualine not found")
	return
end

lualine.setup({
	options = {
		theme = "auto",
		component_separators = { left = "|", right = "|" },
		section_separators = { left = " ", right = "" },
	},
	extensions = { "nvim-tree", "toggleterm" },
	sections = {
		lualine_c = {
			"filename",
		},
		lualine_x = {
			"filesize",
			{
				"fileformat",
				symbols = {
					unix = '', -- e712
					dos = '', -- e70f
					mac = "", -- e711
				},
			},
			"encoding",
			"filetype",
		},
	},
})

