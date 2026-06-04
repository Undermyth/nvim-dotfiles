return {
    'nvim-telescope/telescope.nvim',
    branch = 'master',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function()
        require("config.telescope")
    end
}
