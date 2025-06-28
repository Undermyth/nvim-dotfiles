local opts = {
    noremap = true
}


-- 设置键盘映射
vim.keymap.set('i', '<S-Left>', "<C-o>b")
vim.keymap.set('i', '<S-Right>', "<C-o>w")
vim.keymap.set('i', '<S-Down>', "<Esc><S-G>i")
vim.keymap.set('i', '<S-Up>', "<Esc>ggi")
vim.keymap.set('i', '<S-Backspace>', '<Esc>dawi')
vim.keymap.set('i', '<C-4>', "<Esc><$>a")
vim.keymap.set('i', '<C-6>', "<Esc><^>i")
vim.keymap.set('i', '<C-h>', "<Left>")
vim.keymap.set('i', '<C-j>', "<Down>")
vim.keymap.set('i', '<C-k>', "<Up>")
vim.keymap.set('i', '<C-l>', "<Right>")
vim.keymap.set('n', '<M-Left>', "b")
vim.keymap.set('n', '<M-Right>', "E")
vim.keymap.set('n', '<leader><Tab>', "<C-w>w")
vim.keymap.set('i', '<S-Tab>', "<Esc><C-w>w")
-- vim.keymap.set('n', '<C-w>', ":bd %<CR>")
-- vim.keymap.set('i', '<C-w>', "<Esc>:bd %<CR>")
vim.keymap.set('i', '<C-backspace>', "<Esc>dawi")
vim.keymap.set('n', '<C-Up>', ":resize +2<CR>")
vim.keymap.set('n', '<C-Down>', ":resize -2<CR>")
vim.keymap.set('n', '<C-Left>', ":vertical resize -2<CR>")
vim.keymap.set('n', '<C-Right>', ":vertical resize +2<CR>")
vim.keymap.set('n', '<M-Up>', ":resize +2<CR>")
vim.keymap.set('n', '<M-Down>', ":resize -2<CR>")
vim.keymap.set('n', '<M-Left>', ":vetical resize -2<CR>")
vim.keymap.set('n', '<M-Right>', ":vertical resize +2<CR>")
vim.keymap.set('v', '<C-y>', "\"+y")
vim.keymap.set('v', 'x', '"_x')
