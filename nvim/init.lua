-- simple vim options
require('options')

-- key mapping setup
require('keymap')

-- load diagnostic configuration. will be used by LSP
require('diagnostic')

-- load lazy.nvim as plugin manager. it will further setup other plugins
require('lazynvim')

-- load theme and color setting
require('colorscheme')

-- setup lsp configuration
require('lsp')
