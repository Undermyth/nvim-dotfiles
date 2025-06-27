return {
    "rmagatti/goto-preview",
    event = "BufEnter",
    config = function()
        require("config.preview")
    end
}
