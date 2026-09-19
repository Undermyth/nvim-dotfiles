return {
    "3rd/image.nvim",
    build = false,
    opts = {
        processor = "magick_cli",
        integrations = {
            markdown = {
                enabled = true,
                clear_in_insert_mode = false,
                download_remote_images = true,
                only_render_image_at_cursor = false,
                floating_windows = false,
            },
        },
        max_width = nil,
        max_height = nil,
        max_height_window_percentage = 50,
        window_overlap_clear_enabled = true,
    },
}
