return {
    "echasnovski/mini.diff",
    -- `opts` as a function so that `require("mini.diff")` runs after the plugin
    -- has been added to the runtimepath (a plain table would be evaluated while
    -- the spec is parsed, i.e. during startup).
    opts = function()
        return {
            -- Disabled by default
            source = require("mini.diff").gen_source.none(),
        }
    end,
}
