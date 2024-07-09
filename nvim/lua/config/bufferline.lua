-- bufferline.lua
local status, bufferline = pcall(require, "bufferline")
if not status then
    vim.notify(" bufferline not found")
  return
end

vim.keymap.set('n', '<M-Tab>', ":BufferLineCycleNext<CR>")


bufferline.setup({
    options = {
		offsets = {
			{
				filetype = "NvimTree",
				text = "File Explorer",
				text_align = "left",
				separator = true,
			},
		},
        indicator = {
			icon = '▎', -- 分割线
			style = 'underline',
		},
		buffer_close_icon = '󰅖',
		modified_icon = '●',
		close_icon = '',
        -- highlight = {
        --     underline = false
        -- }
	},
})
