#!/usr/bin/env bash
# skill-gate.sh <skill folder>: may a coding agent use this skill? Scans it with NVIDIA SkillSpector (static analysis,
# no model calls), keeps the JSON report and a one-screen summary in reports/skills/, prints the summary, and exits
# 0 if the skill may be installed, 1 if it is blocked, 2 if the scan did not complete. Run from the repo root on the
# build VM. The content hash covers every file in the skill, so the installed copy can be checked against what was scanned.
set -uo pipefail
SKILL=${1:?usage: skill-gate.sh <skill folder>}
NAME=$(basename "$SKILL")
SPECTOR=${SKILLSPECTOR:-$HOME/skillspector/bin/skillspector}
DIR=${SKILL_GATE_OUT:-reports/skills}     # the demo console's live runs write to /tmp, so the recorded reports stay as they are
OUT=$DIR/$NAME.json
SUM=$DIR/$NAME.txt
mkdir -p "$DIR"

"$SPECTOR" scan "$SKILL" --no-llm --format json --output "$OUT" >/dev/null 2>"/tmp/skill-gate-$NAME.err"
rc=$?
if [ "$rc" -eq 2 ] || [ ! -s "$OUT" ]; then
  echo "ERROR    $NAME: the scan did not complete (exit $rc): $(tail -1 "/tmp/skill-gate-$NAME.err")"
  exit 2
fi

IFS=$'\t' read -r score sev advice complete < <(jq -r '[.risk_assessment.score, .risk_assessment.severity, .risk_assessment.recommendation, .analysis_completeness.is_complete] | @tsv' "$OUT")
hash=$(cd "$SKILL" && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-16)
verdict=$([ "$rc" -eq 0 ] && echo ALLOWED || echo BLOCKED)
{
  echo "$verdict  $NAME  risk $score/100 $sev, $advice, $(jq '.issues | length' "$OUT") findings, scan complete: $complete"
  jq -r '.issues[] | "  \(.severity)  \(.id)  \(.pattern // .category // "rule")  \(.location.file):\(.location.start_line)"' "$OUT"
  echo "  content sha256 $hash, SkillSpector $("$SPECTOR" --version | awk '{print $2}'), exit $rc"
} | tee "$SUM"
exit "$rc"
