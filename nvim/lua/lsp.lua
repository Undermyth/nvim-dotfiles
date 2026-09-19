-- LSP keymaps.
--
-- Registered buffer-locally on `LspAttach`, so `gd` / `gr` / `ge` only exist in
-- buffers that actually have a language server attached (and never shadow the
-- native `gi` command). This file is the single place these mappings live; the
-- previous duplicate global copies in lua/config/preview.lua have been removed.
vim.api.nvim_create_autocmd("LspAttach", {
	callback = function(args)
		local bufopts = { noremap = true, silent = true, buffer = args.buf }

		vim.keymap.set(
			"n",
			"gd",
			"<cmd>lua require('goto-preview').goto_preview_definition()<CR>",
			bufopts
		)
		vim.keymap.set(
			"n",
			"gr",
			"<cmd>lua require('goto-preview').goto_preview_references()<CR>",
			bufopts
		)
		-- `ge`, not `gi`: `gi` is a native command ("insert at last insert
		-- position"). `ge` was free; note it does shadow the native `ge`
		-- (previous word end) in these buffers.
		vim.keymap.set(
			"n",
			"ge",
			"<cmd>lua require('goto-preview').goto_preview_implementation()<CR>",
			bufopts
		)
	end,
})

-- NOTE: `[d` / `]d` are intentionally NOT mapped here.
--   * Neovim 0.12 ships them as built-ins (vim/_core/defaults.lua).
--   * The old `vim.diagnostic.goto_prev/goto_next` calls are deprecated
--     (removed in 0.13) and printed a deprecation warning on every use.
-- The rounded diagnostic float border they used to request is now global,
-- via `vim.o.winborder = "rounded"` in lua/options.lua.
