-- LSP keymaps.
--
-- Registered buffer-locally on `LspAttach`, so they only exist in buffers
-- that actually have a language server attached. This file is the single
-- place these mappings live; the previous duplicate global copies in
-- lua/config/preview.lua have been removed.
--
-- Jump keys (gd / gr / ge) go through telescope's built-in LSP pickers
-- (`list_or_jump`), which gives the behaviour we want:
--   * exactly one target  -> jump straight to it in the current window;
--   * several targets     -> live-preview picker; <CR> opens the selection
--                            in the current window (not in a float).
-- The old goto-preview floating behaviour is kept on `gp*` for explicit
-- peeking when you do not want to leave the current window.
vim.api.nvim_create_autocmd("LspAttach", {
	callback = function(args)
		local bufopts = { noremap = true, silent = true, buffer = args.buf }

		local function telescope(name)
			return function()
				require("telescope.builtin")[name]()
			end
		end

		vim.keymap.set("n", "gd", telescope("lsp_definitions"), bufopts)
		-- `gr` is a prefix of Neovim's built-in `grn`/`gra`/`grr`/`gri`/`grt`/
		-- `gO`: without `nowait` the keypress waits for `timeoutlen` before the
		-- exact buffer-local match wins. `nowait` makes it fire immediately.
		vim.keymap.set(
			"n",
			"gr",
			telescope("lsp_references"),
			vim.tbl_extend("force", bufopts, { nowait = true })
		)
		-- `ge`, not `gi`: `gi` is a native command ("insert at last insert
		-- position"). `ge` was free; note it does shadow the native `ge`
		-- (previous word end) in these buffers.
		vim.keymap.set("n", "ge", telescope("lsp_implementations"), bufopts)

		-- goto-preview: open the target in a floating window (peek) instead of
		-- moving the cursor. Kept on `gp*`; `gp`/`gP` (native paste) will now
		-- wait out `timeoutlen` because of the `gp*` prefix.
		local function preview(fn)
			return function()
				require("goto-preview")[fn]()
			end
		end

		vim.keymap.set("n", "gpd", preview("goto_preview_definition"), bufopts)
		vim.keymap.set("n", "gpr", preview("goto_preview_references"), bufopts)
		vim.keymap.set("n", "gpi", preview("goto_preview_implementation"), bufopts)
		vim.keymap.set("n", "gpt", preview("goto_preview_type_definition"), bufopts)
		vim.keymap.set("n", "gpD", preview("goto_preview_declaration"), bufopts)
		vim.keymap.set("n", "gP", preview("close_all_win"), bufopts)
	end,
})

-- NOTE: `[d` / `]d` are intentionally NOT mapped here.
--   * Neovim 0.12 ships them as built-ins (vim/_core/defaults.lua).
--   * The old `vim.diagnostic.goto_prev/goto_next` calls are deprecated
--     (removed in 0.13) and printed a deprecation warning on every use.
-- The rounded diagnostic float border they used to request is now global,
-- via `vim.o.winborder = "rounded"` in lua/options.lua.