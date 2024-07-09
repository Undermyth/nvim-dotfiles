#!/bin/bash

if [ -d "~/.config/nvim" ]; then
	rm -rf ~/.config/nvim/
fi
cp -r ./nvim ~/.config
