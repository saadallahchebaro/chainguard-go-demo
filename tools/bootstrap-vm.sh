#!/bin/bash
# tools/bootstrap-vm.sh: one-time setup on the build VM, run before the tmux session starts.
# Expects ~/.labrc.sh (the recorder, tools/labrc.sh) and ~/.tmux.conf (tools/tmux.conf) already copied in.
set -eu

# Load the recorder in every interactive shell
grep -qs 'labrc.sh' ~/.bashrc || echo '[ -f ~/.labrc.sh ] && . ~/.labrc.sh   # lab recorder (tools/labrc.sh)' >> ~/.bashrc

# Start the tmux session "lab" (detached), unless it's already running
tmux -V
tmux has-session -t lab 2>/dev/null || tmux new-session -d -s lab -x 200 -y 50
tmux ls

echo "Ready. To connect: multipass shell chainguard, then: tmux attach -t lab"
