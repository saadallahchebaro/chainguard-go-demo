# tools/labrc.sh: the lab recorder. ~/.bashrc on the build VM loads it through ~/.labrc.sh.
#
#   step 09-scan-ab     start a step: later rec calls write to logs/09-scan-ab.log
#   rec 'command'       run it, show the output, and log the command, time, folder, output and exit code
#   note 'text'         add a remark to the current step's log
#   savehist            copy the shell history into logs/shell-history.txt
#
# Quote the whole command when it has >, |, && or $(...). Don't wrap cd, export or source.
# Start a line with a space to keep it out of the history (for anything that might hold a secret).

export LAB="$HOME/chainguard-technical-challenge"
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

# Shell history keeps every command with a time, even ones not run through rec.
export HISTTIMEFORMAT='%F %T  ' HISTSIZE=100000 HISTFILESIZE=100000 HISTCONTROL=ignorespace
shopt -s histappend

# Runs before every prompt: save the history, and if a script is waiting for this command
# to finish (~/.lab-chan names a tmux channel), signal that channel.
_lab_prompt() {
  history -a
  if [ -n "${TMUX:-}" ] && [ -f "$HOME/.lab-chan" ]; then
    local ch
    ch=$(cat "$HOME/.lab-chan"); rm -f "$HOME/.lab-chan"
    tmux wait-for -S "$ch" 2>/dev/null
  fi
}
case ";${PROMPT_COMMAND:-};" in
  *";_lab_prompt;"*) ;;
  *) PROMPT_COMMAND="_lab_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
esac

# Show the current step at the start of the prompt, e.g. [09-scan-ab] ubuntu@chainguard:~$
if [ -z "${_LAB_PS1:-}" ]; then
  _LAB_PS1=1   # a plain shell variable: each new shell adds the step prefix to its own prompt once
  PS1='${STEP:+[$STEP] }'"$PS1"
fi

step() {
  export STEP="$1"; mkdir -p "$LAB/logs"
  printf '\n===== STEP %s · %s · %s\n' "$STEP" "$(date -u +%FT%TZ)" "$(hostname)" >> "$LAB/logs/$STEP.log"
  echo "Recording to logs/$STEP.log"
}

rec() {
  local log="$LAB/logs/${STEP:-00-misc}.log"
  printf '\n$ %s\n# at %s in %s\n' "$*" "$(date -u +%T)" "${PWD/#$HOME/~}" >> "$log"
  ( eval "$*" ) 2>&1 | tee -a "$log"
  local rc=${PIPESTATUS[0]}
  printf '# exit %s\n' "$rc" >> "$log"
  return "$rc"
}

note() { printf '\n# NOTE: %s\n' "$*" >> "$LAB/logs/${STEP:-00-misc}.log"; }

savehist() { history -a; history > "$LAB/logs/shell-history.txt"; }
