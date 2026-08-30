-- Fold with relentless elegance. A collection of quality-of-life features related to folding.
-- https://github.com/chrisgrieser/nvim-origami
--
-- Features (all enabled by default via opts):
--   * LSP-provided folds, with Treesitter fallback (and indent as last resort)
--   * fold-text decorations: line count, diagnostics, git changes (gitsigns/mini.diff)
--   * `h`/`l`/`^`/`$` overloaded as fold/unfold keymaps in normal mode
--   * auto-fold comments & imports when opening a file
--   * pause folds while searching, restore when done
--
-- NOTE: requires nvim 0.11+ and must NOT be used together with nvim-ufo.
return {
    "chrisgrieser/nvim-origami",
    event = "VeryLazy",
    opts = {}, -- required even when using the default config

    -- recommended by upstream: disable vim's auto-folding so origami
    -- controls folding entirely through foldmethod/foldexpr
    init = function()
        vim.opt.foldlevel = 99
        vim.opt.foldlevelstart = 99
    end,
}
