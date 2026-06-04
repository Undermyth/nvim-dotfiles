local status, minicomment = pcall(require, "mini.comment")
if not status then
	vim.notify("mini.comment not found")
	return
end

minicomment.setup({
    mappings = {
        comment = '<leader>c',
        comment_line = '<leader>c',
        comment_visual = '<leader>c',
        text_object = '<leader>c'
    }
})
