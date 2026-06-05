local wezterm = require 'wezterm'
local config = {}

config.color_scheme = 'Night Owl (Gogh)'
-- config.color_scheme = 'Night Owlish Light'

-- Basic Settings --
config.font = wezterm.font('ComicShannsMono Nerd Font', { weight = 'Medium' })
config.font_size = 12.5
config.default_cursor_style = 'BlinkingBar'
config.animation_fps = 1
config.line_height = 1.3
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"
config.default_prog = { 'pwsh.exe' }
config.initial_cols = 120
config.initial_rows = 24

-- Plugin Settings --
local tabline = wezterm.plugin.require 'https://github.com/michaelbrusegard/tabline.wez'
tabline.setup({
    options = {
        theme = 'Night Owl (Gogh)'
    },
    sections = {
        tabline_a = { 'workspace' },
        tabline_b = { ' ' },
        tabline_c = { ' ' },
        tabline_x = { ' ' },
        tabline_y = { 'datetime' },
        tabline_z = { 'domain' }
    }
})
tabline.apply_to_config(config)

return config
