-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
    local lazyrepo = "https://github.com/folke/lazy.nvim.git"
    local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
    if vim.v.shell_error ~= 0 then
        vim.api.nvim_echo({
            { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
            { out, "WarningMsg" },
            { "\nPress any key to exit..." },
        }, true, {})
        vim.fn.getchar()
        os.exit(1)
    end
end
vim.opt.rtp:prepend(lazypath)

-- Make sure to setup `mapleader` and `maplocalleader` before
-- loading lazy.nvim so that mappings are correct.
-- This is also a good place to setup other settings (vim.opt)
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

require("lazy").setup({
    {
        "catppuccin/nvim", 
        name = "catppuccin", 
        priority = 1000,
        opts = {
            flavour = "latte",
            transparent_background = true
        }
    },
    -- Vscode-like pictograms
	{
		"onsails/lspkind.nvim",
		event = { "VimEnter" },
	},
	-- Auto-completion engine
	{
		"hrsh7th/nvim-cmp",
		dependencies = {
			"lspkind.nvim",
			"hrsh7th/cmp-nvim-lsp", -- lsp auto-completion
			"hrsh7th/cmp-buffer", -- buffer auto-completion
			"hrsh7th/cmp-path", -- path auto-completion
			"hrsh7th/cmp-cmdline", -- cmdline auto-completion
		},
		config = function()
			require("config.nvim-cmp")
		end,
	},
	-- Code snippet engine
	{
		"L3MON4D3/LuaSnip",
		version = "v2.*",
	},
    {
        'windwp/nvim-autopairs',
        event = "InsertEnter",
        config = true
        -- use opts = {} for passing setup options
        -- this is equalent to setup({}) function
    },
    { 
        "kyazdani42/nvim-tree.lua",
        event = "VimEnter",
        dependencies = "nvim-tree/nvim-web-devicons",
        config = function()
            require("config.nvim-tree")
        end,
    },
    "williamboman/mason.nvim",
	"williamboman/mason-lspconfig.nvim",
	"neovim/nvim-lspconfig",
    -- {
    --     'akinsho/bufferline.nvim', 
    --     version = "*", 
    --     dependencies = 'nvim-tree/nvim-web-devicons',
    --     config = function()
    --         require("config.bufferline")
    --     end,
    -- },
    {
        'nvim-lualine/lualine.nvim',
        dependencies = { 'nvim-tree/nvim-web-devicons'},
        config = function()
            require("config.lualine")
        end
    },
    {
        'nvim-telescope/telescope.nvim', 
        tag = '0.1.8',
        dependencies = { 'nvim-lua/plenary.nvim' },
        config = function()
            require("config.telescope")
        end
    },
    {
        'numToStr/Comment.nvim',
        opts = {
            -- add any options here
        }
    },
    {
        "karb94/neoscroll.nvim",
        config = function()
            require("config.neoscroll")
        end
    },
    {
        'akinsho/toggleterm.nvim', 
        version = "*",
        config = function()
            require("config.toggleterm")
        end
    },
    {
        "hedyhli/outline.nvim",
        config = function()
            require("config.outline")
        end
    },
    {
        'romgrk/barbar.nvim',
        dependencies = {
          'lewis6991/gitsigns.nvim', -- OPTIONAL: for git status
          'nvim-tree/nvim-web-devicons', -- OPTIONAL: for file icons
        },
        init = function() vim.g.barbar_auto_setup = false end,
        config = function()
            require("config.barbar")
        end,
        version = '^1.0.0', -- optional: only update when a new 1.x version is released
    },
    {
        "ray-x/lsp_signature.nvim",
        event = "VeryLazy",
        config = function()
            require("config.lspsignature")
        end
    },
    -- {
    --     "ojroques/nvim-lspfuzzy",
    --     config = function()
    --         require("config/lspfuzzy")
    --     end
    -- },
    {
        "nvim-treesitter/nvim-treesitter",
        build = ":TSUpdate",
        config = function()
            require("config.treesitter")
        end
    },
    {
        "rmagatti/goto-preview",
        event = "BufEnter",
        config = function()
            require("config.preview")
        end
    },
    {
        'Exafunction/codeium.vim',
        event = 'BufEnter'
    }
})
