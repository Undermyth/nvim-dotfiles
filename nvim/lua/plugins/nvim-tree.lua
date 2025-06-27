return { 
	"kyazdani42/nvim-tree.lua",
	event = "VimEnter",
	dependencies = "nvim-tree/nvim-web-devicons",
	config = function()
		require("config.nvim-tree")
	end,
}
