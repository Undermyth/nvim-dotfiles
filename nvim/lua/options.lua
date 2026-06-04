-- Hint: use `:h <option>` to figure out the meaning if needed
vim.opt.clipboard = 'unnamedplus' -- use system clipboard
vim.opt.completeopt = { 'menu', 'menuone', 'noselect' }
vim.opt.mouse = 'a' -- allow the mouse to be used in Nvim

-- Tab
vim.opt.tabstop = 4 -- number of visual spaces per TAB
vim.opt.softtabstop = 4 -- number of spacesin tab when editing
vim.opt.shiftwidth = 4 -- insert 4 spaces on a tab
vim.opt.expandtab = true -- tabs are spaces, mainly because of python

-- UI config
vim.opt.number = true -- show absolute number
vim.opt.relativenumber = true -- add numbers to each line on the left side
vim.opt.cursorline = true -- highlight cursor line underneath the cursor horizontally
vim.opt.splitbelow = true -- open new vertical split bottom
vim.opt.splitright = true -- open new horizontal splits right
vim.opt.termguicolors = true        -- enabl 24-bit RGB color in the TUI
-- vim.opt.showmode = false -- we are experienced, wo don't need the "-- INSERT --" mode hint

-- Searching
vim.opt.incsearch = true -- search as characters are entered
vim.opt.hlsearch = true -- do not highlight matches
vim.opt.ignorecase = true -- ignore case in searches by default
vim.opt.smartcase = true -- but make it case sensitive if an uppercase is entered

-- leader 
-- Make sure to setup `mapleader` and `maplocalleader` before
-- loading lazy.nvim so that mappings are correct.
-- This is also a good place to setup other settings (vim.opt)
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- clipboard
vim.g.clipboard = 'osc52'
-- vim.o.winborder = "rounded"

-- cursor
vim.opt.guicursor = { "n-c:block,i-t-v-ci-ve:ver25,r-cr:hor20,o:hor50,a:blinkwait700-blinkoff400-blinkon250-Cursor/lCursor,sm:block-blinkwait175-blinkoff150-blinkon175" }

-- auto highlight 
-- 1. 创建一个 augroup (自动命令组)，方便管理
local auto_highlight_group = vim.api.nvim_create_augroup("AutoHighlight", { clear = true })
-- 2. 设置触发 CursorHold 事件的延迟时间
vim.opt.updatetime = 300
-- 3. 定义当光标移动或离开时清除高亮的功能
local function clear_document_highlights()
    -- 如果 document highlight 的窗口存在，就关闭它
    -- 这是最可靠的清除方法
    pcall(vim.lsp.buf.clear_references)
end
-- 4. 当光标移动时，立即清除旧的高亮
vim.api.nvim_create_autocmd({ "CursorMoved" }, {
    group = auto_highlight_group,
    callback = function()
        clear_document_highlights()
    end,
})
-- 5. 当光标停留时，在 normal 模式下触发新的高亮
vim.api.nvim_create_autocmd({ "CursorHold" }, {
    group = auto_highlight_group,
    callback = function()
        -- 只在 normal 模式下并且没有选区时执行
        if vim.fn.mode() == "n" and vim.fn.visualmode() == "" then
            -- 调用内置的文档高亮功能
            -- 它会自动处理光标下是否有单词等情况
            vim.lsp.buf.document_highlight()
        end
    end,
})
