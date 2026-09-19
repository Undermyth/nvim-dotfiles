local status, preview = pcall(require, "goto-preview")
if not status then
	vim.notify("preview not found")
	return
end

-- Keymaps live in lua/lsp.lua, registered buffer-locally on `LspAttach`
-- (gd / gr / ge). Do not add global gd/gr/gi/gt maps here: they would be
-- global overrides of native keys and would duplicate the LspAttach maps.

preview.setup({

})
