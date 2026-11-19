#!/usr/bin/env bash
# tools/show-dockerfile.sh a|b|c|d|e: one image's Dockerfile, as in the repo, with its line numbers. A ">" marks each
# instruction that isn't in the image before it (B against A, C against B, and so on): the lines in green on the
# deck's slides 60 to 64. Read-only. Run from anywhere in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
file() { case $1 in a) echo Dockerfile.a-single ;; b) echo Dockerfile.b-multi ;; c) echo Dockerfile.c-chainguard ;;
                    d) echo Dockerfile.d-updated ;; e) echo Dockerfile.e-patched ;; *) return 1 ;; esac; }
k=${1:-}
name=$(file "$k") || { echo "usage: $0 a|b|c|d|e" >&2; exit 2; }
case $k in b) p=a ;; c) p=b ;; d) p=c ;; e) p=d ;; *) p= ;; esac
f=dockerfiles/$name; prev=/dev/null; [ -n "$p" ] && prev=dockerfiles/$(file "$p")
P=$(echo "$p" | tr a-e A-E)
echo "== $f, $(wc -l < "$f" | tr -d ' ') lines${p:+; > marks what is not in image $P}"
awk -v prev="$prev" -v hasprev="${p:+1}" '
  FILENAME == prev { if ($0 !~ /^[ \t]*(#|$)/) { t = $0; gsub(/^[ \t]+|[ \t]+$/, "", t); seen[t] = 1 }; next }
  { t = $0; gsub(/^[ \t]+|[ \t]+$/, "", t)
    m = (hasprev && t != "" && t !~ /^#/ && !(t in seen)) ? ">" : " "
    printf "%s %3d  %s\n", m, FNR, $0 }' "$prev" "$f"
