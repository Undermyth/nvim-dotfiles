-- local colorscheme = 'catppuccin-mocha'
local colorscheme = 'night-owl'

local is_ok = pcall(vim.cmd, "colorscheme " .. colorscheme)
if not is_ok then
    vim.notify('colorscheme ' .. colorscheme .. ' not found!')
    return
end
