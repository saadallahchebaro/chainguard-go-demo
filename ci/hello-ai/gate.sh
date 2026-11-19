#!/usr/bin/env bash
# gate.sh: every check a change must pass before it can merge. Run from the repo root, on the build VM
# (Docker, Grype, cosign, jq and curl). The same script runs by hand, from a Git hook, or from GitHub Actions.
set -uo pipefail
COMMIT=${GATE_COMMIT:-$(git rev-parse HEAD)}
SHA=${COMMIT:0:7}
IMG=hello-ai:$SHA
fail=0
check() {    # check <name> <detail> <exit code>
  if [ "$3" -eq 0 ]; then printf 'PASS  %-12s %s\n' "$1" "$2"; else printf 'FAIL  %-12s %s\n' "$1" "$2"; fail=1; fi
}

# 1. Every base image is a Chainguard image, pinned by digest
bad=$(grep -iE '^FROM ' Dockerfile | grep -vE '^FROM cgr\.dev/chainguard/[a-z0-9._/-]+(:[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}( |$)' || true)
check "base image" "${bad:-all from cgr.dev/chainguard, pinned by digest}" "$([ -z "$bad" ]; echo $?)"

# 2. Chainguard's signature verifies on each base image
sig=0
for ref in $(grep -iE '^FROM ' Dockerfile | awk '{print $2}' | sort -u); do
  cosign verify "$ref" \
    --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
    --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main \
    >/dev/null 2>&1 || sig=1
done
check "base signed" "Chainguard's signature on each base image" "$sig"

# 3. Every dependency is pinned to an exact version
unpinned=$(grep -vE '^[[:space:]]*(#|$)' requirements.txt | grep -vE '^[A-Za-z0-9._-]+==[0-9][A-Za-z0-9.]*$' || true)
check "pinned deps" "${unpinned:-every line is name==version}" "$([ -z "$unpinned" ]; echo $?)"

# 4. No dependency was published less than 7 days ago
young=""
cutoff=$(date -u -d '7 days ago' +%s)
while IFS='=' read -r name _ version; do
  up=$(curl -fsS "https://pypi.org/pypi/$name/$version/json" | jq -r '.urls[0].upload_time_iso_8601 // empty')
  if [ -n "$up" ] && [ "$(date -u -d "$up" +%s)" -gt "$cutoff" ]; then young="$young $name==$version"; fi
done < <(grep -E '^[A-Za-z0-9._-]+==' requirements.txt)
check "cooldown" "${young:-nothing newer than 7 days}" "$([ -z "$young" ]; echo $?)"

# 5. It builds
docker build -q -t "$IMG" . >/dev/null 2>&1; built=$?
check "build" "docker build" "$built"

if [ "$built" -eq 0 ]; then
  # 6. It doesn't run as root
  user=$(docker image inspect "$IMG" --format '{{.Config.User}}')
  case "$user" in ""|0|root|0:*) nonroot=1 ;; *) nonroot=0 ;; esac
  check "user" "runs as ${user:-root}" "$nonroot"

  # 7. No high or critical finding that has a fix
  grype "$IMG" --fail-on high --only-fixed -q >/dev/null 2>&1
  check "scan" "no fixable high or critical finding" "$?"
fi

result=$([ "$fail" -eq 0 ] && echo pass || echo fail)
jq -n --arg commit "$COMMIT" --arg result "$result" '{commit: $commit, result: $result, checkedAt: (now | todate)}' > verdict.json
echo "GATE ${result^^} for $SHA"
exit $fail
