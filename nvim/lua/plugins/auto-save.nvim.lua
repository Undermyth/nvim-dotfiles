return {
    "okuuva/auto-save.nvim",
    version = '^1.0.0', -- see https://devhints.io/semver, alternatively use '*' to use the latest tagged release
    cmd = "ASToggle", -- optional for lazy loading on command
    event = { "InsertLeave", "TextChanged" }, -- optional for lazy loading on trigger events
    opts = {
        enabled = true, -- explicit: do not depend on the upstream default
        trigger_events = {
            immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" },
            -- Debounced saves. These were previously emptied ({}), which made
            -- `debounce_delay` below a dead option and reduced this plugin to
            -- "save only when leaving the buffer".
            defer_save = { "InsertLeave", "TextChanged" },
            cancel_deferred_save = { "InsertEnter" }
        },
        debounce_delay = 300
    },
}
