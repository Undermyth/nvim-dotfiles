-- nvim-treesitter (main branch) — nvim 0.12+ only.
--
-- The main branch is a pure parser/query installer: the old master-branch
-- setup() options (ensure_installed / highlight / indent) no longer exist and
-- are silently ignored. Features are enabled with plain Neovim API instead:
--   * highlight: vim.treesitter.start() per buffer. Nvim 0.12's runtime
--     already calls it from its bundled ftplugins for lua / markdown /
--     help(vimdoc) / query, so those filetypes only need their parsers.
--   * folds: nvim-origami (LSP with treesitter fallback).
--   * indent: runtime indent scripts (keeps the g:pyindent_* tweaks working).
--
-- WARNING: vim.treesitter.start() throws when the parser is missing. An error
-- inside a FileType autocmd aborts buffer loading and marks the buffer
-- BF_READERR; every later ":w" then fails with
-- "E13: File exists (add ! to override)" when the file was opened from a Lua
-- callback context (e.g. telescope). Always guard calls with pcall().

-- Parsers (+ their queries) to keep installed. install() is async and only
-- fetches what is missing, so a fresh machine self-heals on first start
-- (needs network access and a C compiler).
local parsers = {
    "lua", "markdown", "markdown_inline", "vimdoc", "query", -- nvim 0.12 ftplugins
    "python", "rust", "html", "latex", "yaml"                -- daily use (latex = parser name; its filetypes are tex/latex/plaintex)
}

require("nvim-treesitter").install(parsers)

-- Make the `tex` / `plaintex` filetypes resolve to the `latex` parser.
-- (nvim-treesitter also registers `latex = { 'tex' }` from its bundled
-- plugin/filetypes.lua; register() is idempotent and also covers plaintex,
-- which is the filetype Neovim picks for plain-looking .tex files.)
vim.treesitter.language.register("latex", "tex")
vim.treesitter.language.register("latex", "plaintex")

-- Filetypes whose highlighting we start ourselves (everything not covered by
-- a bundled ftplugin). Derived from `parsers` so a parser can never drift from
-- its filetypes again; `plaintex` is appended explicitly in case a future
-- parser set stops declaring it (the `.tex` filetype Neovim picks for
-- plain-looking files). Duplicates are dropped so an ft is never listed twice.
local auto_start = { "plaintex" }
for _, parser in ipairs(parsers) do
    vim.list_extend(auto_start, vim.treesitter.language.get_filetypes(parser))
end
auto_start = vim.fn.uniq(vim.fn.sort(auto_start))

vim.api.nvim_create_autocmd("FileType", {
    group = vim.api.nvim_create_augroup("config.treesitter", { clear = true }),
    pattern = auto_start,
    callback = function()
        pcall(vim.treesitter.start)
    end,
})
