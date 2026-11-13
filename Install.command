#!/bin/zsh
INSTALL_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 "$INSTALL_ROOT/scripts/install.py"
INSTALL_RESULT=$?
printf '\nPress Return to close.\n'
read -r
exit "$INSTALL_RESULT"
