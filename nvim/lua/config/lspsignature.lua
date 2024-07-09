local status, lspsignature = pcall(require, "lsp_signature")
if not status then
	vim.notify("lsp_signature not found")
	return
end

vim.keymap.set({ 'n' }, '<leader>s', function() require('lsp_signature').toggle_float_win()
    end, { silent = true, noremap = true, desc = 'toggle signature' })


lspsignature.setup({
    bind = true, -- This is mandatory, otherwise border config won't get registered.
    handler_opts = {
        border = "rounded"
    },
    hint_prefix = "> ",
})
