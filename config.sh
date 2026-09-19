#!/bin/bash

ln -s nvim ~/.config/nvim
mkdir -p ~/.config/zellij/
mkdir -p ~/.config/zellij/layouts
cp zellij/config.kdl ~/.config/zellij
cp zellij/cappu_status.kdl ~/.config/zellij/layouts
