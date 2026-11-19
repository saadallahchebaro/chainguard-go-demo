#!/usr/bin/env bash
# tools/show-fixes.sh: the app as delivered (image D) and the fixed app (image E), side by side, live.
#   bash tools/show-fixes.sh log        Gin's startup warnings, and the client IP each one logs for a forged header
#   bash tools/show-fixes.sh timeout    a request that sends half its header and stops: does the server hang up?
#   bash tools/show-fixes.sh versions   what changed from C to D (Go, each module, base images), then from D to E (settings)
#   bash tools/show-fixes.sh all        the three, one after another
# D and E are built from the same go.mod and go.sum, on the same builder and runtime images; they differ only in E's three
# app changes (GIN_MODE=release; in main.go, no trusted proxies and an http.Server with timeouts). Both scan to zero.
# Read-only: it starts throwaway containers on ports 18091 to 18094 and removes them. Run from the repo root.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

log() {   # findings F1 (debug mode) and F2 (trusts every proxy)
  docker run -d --rm --name q-fix-d -p 18091:8080 hello:d >/dev/null
  docker run -d --rm --name q-fix-e -p 18092:8080 hello:e >/dev/null
  sleep 2
  for p in 18091 18092; do curl -s -o /dev/null -H "X-Forwarded-For: 203.0.113.9" "localhost:$p/"; done
  echo "Each app gets one request claiming, in X-Forwarded-For, to come from 203.0.113.9."
  echo
  echo "===== D, the app as delivered (its modules updated): its log"
  docker logs q-fix-d 2>&1
  echo
  echo "===== E, the fixed app: its log"
  docker logs q-fix-e 2>&1
  docker stop q-fix-d q-fix-e >/dev/null
}

timeout_test() {   # finding F8: no server timeouts
  docker run -d --rm --name q-to-d -p 18093:8080 hello:d >/dev/null
  docker run -d --rm --name q-to-e -p 18094:8080 hello:e >/dev/null
  sleep 2
  echo "Each app gets half a request header, then nothing. A server with no timeouts keeps the connection open."
  for app in D:18093 E:18094; do
    name=${app%%:*}; port=${app##*:}; s=$(date +%s)
    exec 3<>"/dev/tcp/127.0.0.1/$port"
    printf 'GET / HTTP/1.1\r\nHost: localhost\r\n' >&3
    timeout 10 cat <&3 >/dev/null; rc=$?
    if [ "$rc" = 124 ]; then echo "$name: still open after 10 s, so no timeout"
    else echo "$name: the server closed the connection after $(( $(date +%s) - s )) s"; fi
    exec 3>&-
  done
  docker stop q-to-d q-to-e >/dev/null
}

versions() {   # C to D: the toolchain, every module, the images it builds on; D to E: the app's own settings
  for i in c d e; do
    docker create --name q-bin "hello:$i" >/dev/null && docker cp q-bin:/usr/local/bin/hello-server "/tmp/q-bin-$i" && docker rm q-bin >/dev/null
  done
  deps() { go version -m "$1" | awk '$1 == "dep" { print $2, $3 }' | LC_ALL=C sort; }
  from() { grep '^FROM' "dockerfiles/Dockerfile.$1" | sed -n "$2p" | awk '{ print $2 }' | sed 's#cgr.dev/chainguard/##; s/:latest@sha256:\(.\{8\}\).*/@\1/'; }
  env_of() { docker image inspect "hello:$1" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$2=//p" | grep . || echo unset; }
  echo "===== C to D: the dependency update"
  {
    echo "COMPONENT C:ORIGINAL D:UPDATED CHANGE"
    echo "Go(standard-library) $(go version /tmp/q-bin-c | cut -d' ' -f2) $(go version /tmp/q-bin-d | cut -d' ' -f2) updated"
    LC_ALL=C join -a1 -a2 -e - -o 0,1.2,2.2 <(deps /tmp/q-bin-c) <(deps /tmp/q-bin-d) |
      awk '{ print $1, $2, $3, ($2 == "-") ? "added" : ($3 == "-") ? "removed" : ($2 == $3) ? "same" : "updated" }'
    echo "Build-image $(from c-chainguard 1) $(from d-updated 1) changed"
    echo "Runtime-image $(from c-chainguard 2) $(from d-updated 2) same"
    echo "Binary-size $(du -h /tmp/q-bin-c | cut -f1) $(du -h /tmp/q-bin-d | cut -f1) grew"
  } | column -t
  echo
  echo "===== D to E: the app's own code and settings"
  {
    echo "COMPONENT D E CHANGE"
    echo "Go(standard-library) $(go version /tmp/q-bin-d | cut -d' ' -f2) $(go version /tmp/q-bin-e | cut -d' ' -f2) same"
    echo "Modules $(deps /tmp/q-bin-d | wc -l) $(deps /tmp/q-bin-e | wc -l) $(cmp -s <(deps /tmp/q-bin-d) <(deps /tmp/q-bin-e) && echo same || echo different)"
    echo "Build-image $(from d-updated 1) $(from e-patched 1) same"
    echo "Runtime-image $(from d-updated 2) $(from e-patched 2) same"
    echo "GIN_MODE $(env_of d GIN_MODE) $(env_of e GIN_MODE) set"
  } | column -t
  echo "In main.go (diff -u go-updated/main.go go-patched/main.go): SetTrustedProxies(nil), and an http.Server with timeouts."
  rm -f /tmp/q-bin-c /tmp/q-bin-d /tmp/q-bin-e
}

case "${1:-all}" in
  log) log ;;
  timeout) timeout_test ;;
  versions) versions ;;
  all) log; echo; timeout_test; echo; versions ;;
  *) echo "usage: bash tools/show-fixes.sh log|timeout|versions|all" >&2; exit 2 ;;
esac
