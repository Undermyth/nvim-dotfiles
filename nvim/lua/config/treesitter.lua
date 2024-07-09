local status, treesitter = pcall(require, "nvim-treesitter.configs")
if not status then
	vim.notify("treesitter not found")
	return
end

treesitter.setup({
    ensure_installed = {"python", "lua", "rust"},
    highlight = {
        enable = true,
        additional_vim_regex_highlighting = false
    },
    indent = {
        enable = true
    }
})
