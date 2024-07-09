local status, barbar = pcall(require, "barbar")
if not status then
    vim.notify(" barbar not found")
  return
end

vim.keymap.set('n', '<C-h>', '<Cmd>BufferPrevious<CR>')
vim.keymap.set('n', '<C-l>', '<Cmd>BufferNext<CR>')
vim.keymap.set('n', '<C-w>', '<Cmd>BufferClose<CR>')

barbar.setup({
    animation = true,
    auto_hide = true,
    sidebar_filetypes = {
        NvimTree = true
    }
})
