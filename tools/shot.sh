#!/bin/bash
# tools/shot.sh NN-what : a real screenshot of the Terminal window showing the lab session,
# saved as demo/screenshots/NN-what.png. Runs on the Mac (macOS screencapture of that one window).
set -euo pipefail
NAME=${1:?usage: tools/shot.sh NN-what}
DIR="$(cd "$(dirname "$0")/.." && pwd)/demo/screenshots"
mkdir -p "$DIR"
# The Terminal window logged into the build VM (its title contains "multipass shell chainguard")
WID=$(osascript -e 'tell application "Terminal" to get id of (first window whose name contains "multipass shell chainguard")')
screencapture -x -o -l "$WID" "$DIR/$NAME.png"   # -x no sound, -o no shadow, -l that window only
sips -g pixelWidth -g pixelHeight "$DIR/$NAME.png" | tail -2
echo "saved demo/screenshots/$NAME.png"
