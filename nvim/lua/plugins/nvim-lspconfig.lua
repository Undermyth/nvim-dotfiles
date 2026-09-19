return {
    "neovim/nvim-lspconfig",

    -- How to add an LSP for a specific programming language?
    -- 1. Use `:Mason` to install the corresponding LSP.
    -- 2. Enable it below, and set per-language settings with
    --    `vim.lsp.config('<name>', { ... })` (the new config API).
    -- Hint (find <name> here): https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md
    config = function ()
	vim.lsp.enable({ 'rust_analyzer', 'ty' })

        -- NOTE: floating-window borders are handled globally by
        -- `vim.o.winborder = "rounded"` in lua/options.lua, so no per-plugin
        -- `ui` / `diagnostics` setup options are needed here.
        --
        -- Case 1. For CMake Users
        --     $ cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON .
        -- Case 2. For Bazel Users, use https://github.com/hedronvision/bazel-compile-commands-extractor
        -- Case 3. If you don't use any build tool and all files in a project use the same build flags
        --     Place your compiler flags in the compile_flags.txt file, located in the root directory
        --     of your project. Each line in the file should contain a single compiler flag.
        -- src: https://clangd.llvm.org/installation#compile_commandsjson
        --
        -- Examples (language server name -> settings):
        --   vim.lsp.config('tinymist', { settings = { formatterMode = "typstyle" } })
        --   vim.lsp.config('ty', {})
        --   vim.lsp.config('ruff', {})
        end
}
