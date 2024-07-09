local opts = {
    noremap = true
}


-- 设置键盘映射
vim.keymap.set('i', '<M-Left>', "<Esc>bi") 
vim.keymap.set('i', '<M-Right>', "<Esc>Ea")
vim.keymap.set('i', '<M-Down>', "<Esc><S-G>i")
vim.keymap.set('i', '<M-Up>', "<Esc>ggi")
vim.keymap.set('i', '<M-Backspace>', '<Esc>dawi')
vim.keymap.set('i', '<C-4>', "<Esc><$>a")
vim.keymap.set('i', '<C-6>', "<Esc><^>i")
vim.keymap.set('i', '<C-h>', "<Left>")
vim.keymap.set('i', '<C-j>', "<Down>")
vim.keymap.set('i', '<C-k>', "<Up>")
vim.keymap.set('i', '<C-l>', "<Right>")
vim.keymap.set('n', '<M-Left>', "b")
vim.keymap.set('n', '<M-Right>', "w")
vim.keymap.set('n', '<S-Tab>', "<C-w>w")
vim.keymap.set('i', '<S-Tab>', "<Esc><C-w>w")
-- vim.keymap.set('n', '<C-w>', ":bd %<CR>")
-- vim.keymap.set('i', '<C-w>', "<Esc>:bd %<CR>")
vim.keymap.set('i', '<C-backspace>', "<Esc>dawi")
