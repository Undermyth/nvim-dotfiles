local colorscheme = 'catppuccin-mocha'

local is_ok, catppuccin = pcall(vim.cmd, "colorscheme " .. colorscheme)
if not is_ok then
    vim.notify('colorscheme ' .. colorscheme .. ' not found!')
    return
end
