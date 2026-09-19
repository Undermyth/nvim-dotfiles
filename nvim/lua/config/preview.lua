local status, preview = pcall(require, "goto-preview")
if not status then
	vim.notify("preview not found")
	return
end

-- Keymaps live in lua/lsp.lua, registered buffer-locally on `LspAttach`
-- (gpd / gpr / gpi / gpt / gpD / gP for the floating previews; gd / gr / ge
-- are telescope pickers and no longer use goto-preview).
-- Do not enable `default_mappings` here: goto-preview installs those as
-- *global* maps, which would shadow gpd/gpr/... in every buffer, LSP or not.

preview.setup({
	default_mappings = false,
})
