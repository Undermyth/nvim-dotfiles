return {
    "nvim-tree/nvim-tree.lua",
    dependencies = {
        "nvim-tree/nvim-web-devicons",
    },
    keys = {
        { "<leader>b", ":NvimTreeToggle<CR>", desc = "Toggle nvim-tree" },
    },
    config = function()
        require("config.nvim-tree")
    end
}
