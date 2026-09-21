return {
  -- 1. 配置 LuaSnip 启用自动补全片段 (enable_autosnippets)
  {
    "L3MON4D3/LuaSnip",
    opts = function(_, opts)
      opts.enable_autosnippets = true
    end,
  },

  -- 2. 添加并配置 luasnip-latex-snippets.nvim
  {
    "iurimateus/luasnip-latex-snippets.nvim",
    -- 如果使用 latex 语法文件，在打开 tex/markdown 文件时载入
    ft = { "tex", "markdown" },
    dependencies = {
      "L3MON4D3/LuaSnip",
      -- 默认使用 vimtex 判断数学环境，如果不打算安装 vimtex，需开启 use_treesitter（见下方 opts 参数）
      "lervag/vimtex",
    },
    opts = {
      use_treesitter = false, -- 设置为 true 可用 Treesitter 替代 vimtex 检测数学环境（推荐）
      allow_on_markdown = true, -- 是否在 markdown 文件中启用 LaTeX 代码片段
    },
    config = function(_, opts)
      require("luasnip-latex-snippets").setup(opts)
    end,
  },
}
