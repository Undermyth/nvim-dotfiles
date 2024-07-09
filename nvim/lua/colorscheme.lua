-- define your colorscheme here
local colorscheme = 'catppuccin-latte'

local is_ok, catppuccin = pcall(vim.cmd, "colorscheme " .. colorscheme)
if not is_ok then
    vim.notify('colorscheme ' .. colorscheme .. ' not found!')
    return
end

-- catppuccin.setup({
--     flavour = "auto",
--     transparent_background = true
-- })
