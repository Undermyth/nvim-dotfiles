return {
	"catppuccin/nvim", 
	name = "catppuccin", 
	priority = 1000,
	opts = {
		flavour = "latte",
		transparent_background = true,
		term_colors = true,
		styles = {
			comments = {},
			conditionals = {},
			loops = {},
			functions = {},
			keywords = {},
			strings = {},
			variables = {},
			numbers = {},
			booleans = {},
			properties = {},
			types = {},
			modules = {},
			module = {}
		},
		color_overrides = {
			mocha = {
				base = "#000000",
				mantle = "#000000",
				crust = "#000000",
			},
		},
		integrations = {
			telescope = {
				enabled = true,
				style = "nvchad",
			},
			dropbar = {
				enabled = true,
				color_mode = true,
			},
		},
	}
}
