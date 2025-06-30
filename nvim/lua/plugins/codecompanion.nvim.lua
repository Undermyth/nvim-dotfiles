return {
    "olimorris/codecompanion.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
    },
    -- config = function()
    --     require("config.codecompanion")
    -- end,
    opts = {
        display = {
            diff = { provider = 'mini_diff' },
            chat = {
                icons = {
                    buffer_pin = " ",
                    buffer_watch = "👀 ",
                },
                window = {
                    border = "rounded",
                }
            }
        },
        adapters = {
            openrouter = function()
                return require("codecompanion.adapters").extend("openai_compatible", {
                    env = {
                        url = "https://openrouter.ai/api",
                        api_key = "OPENROUTER_API_KEY",
                        chat_url = "/v1/chat/completions",
                    },
                    schema = {
                        model = {
                            default = "google/gemini-2.5-flash-preview-05-20"
                        }
                    }
                })
            end
        },
        strategies = {
            chat = {
                adapter = "openrouter",
                keymaps = {
                    send = {
                       modes = { n = "<C-s>", i = "<C-s>" },
                    }
                }
            },
            inline = {
                adapter = "openrouter",
                keymaps = {
                    accept_change = {
                        modes = { n = "<leader>ga" },
                        description = "Accept the suggested change",
                    },
                    reject_change = {
                        modes = { n = "<leader>gr" },
                        description = "Reject the suggested change",
                    }
                }
            },
            cmd = {
                adapter = "openrouter"
            }
        }
    }
}
