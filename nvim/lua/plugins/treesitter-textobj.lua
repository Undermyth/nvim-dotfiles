return {
    "nvim-treesitter/nvim-treesitter-textobjects",
    init = function ()
        vim.g.no_plugin_maps = true
    end,
    config = function ()
        require('config.treesitter-textobj')
    end
}
