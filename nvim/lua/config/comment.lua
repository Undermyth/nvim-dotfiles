cal status, comment = pcall(require, "Comment")
if not status then
	vim.notify("Comment not found")
	return
end

vim.keymap.set('v', '<C-/>', "gc")
vim.keymap.set('i', '<C-/>', "<Esc>gcci")
vim.keymap.set('v', '<M-/>', "gc")
vim.keymap.set('i', '<M-/>', "<Esc>gcci")
vim.keymap.set('n', '<C-/>', "gcc")
vim.keymap.set('n', '<M-/>', "gcc")
