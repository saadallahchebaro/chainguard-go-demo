#!/usr/bin/env bash
# tools/compare-bases.sh: image C (Chainguard's static base) against image C-distroless (Google's distroless static base),
# built from the same Dockerfile apart from the runtime FROM, so the app binary is the same file. Everything is measured:
# each base's signature and attestations, its packages, the image's size, user and shell, and Grype's and Trivy's counts
# with the databases of the same-day rescan (no update). Writes reports/distroless/ and prints the table.
# Run on the build VM from the repo root, after: docker build -t hello:c-distroless -f dockerfiles/Dockerfile.c-distroless ./go
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=reports/distroless; mkdir -p "$OUT"
export GRYPE_DB_AUTO_UPDATE=false
declare -A BASE=([c]="cgr.dev/chainguard/static@sha256:fc42af33e643f20d08baf03cddcc1c02ba57052dfb02edb0d79f3fc47bcea8d9"
                 [c-distroless]="gcr.io/distroless/static-debian13@sha256:aafe993665bf6200db38a02c11a9351e782a84b6a45e7f33b6695638c88e3931")
declare -A ISSUER=([c]=https://token.actions.githubusercontent.com [c-distroless]=https://accounts.google.com)
declare -A IDENT=([c]=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main
                  [c-distroless]=keyless@distroless.iam.gserviceaccount.com)
declare -A R
for t in c c-distroless; do
  img=hello:$t; b=${BASE[$t]}
  # the base: signature, attestations, recorded build date
  if cosign verify "$b" --certificate-oidc-issuer "${ISSUER[$t]}" --certificate-identity "${IDENT[$t]}" >/dev/null 2>&1
  then R[$t,sig]="verified (${IDENT[$t]%%/.github*})"; else R[$t,sig]="NOT verified"; fi
  R[$t,att]=$(cosign download attestation "$b" 2>/dev/null | jq -r '.payload' | base64 -d | jq -r '.predicateType' \
              | sed 's#https://##; s#/Document##' | sort | paste -sd, - | sed 's/,/, /g')
  R[$t,created]=$(crane config --platform linux/arm64 "$b" | jq -r '.created[0:10]')
  # the image: packages, size, user, shell, the app answering, the binary
  syft "$img" -q -o syft-json > "$OUT/$t-syft.json"
  R[$t,pkgs]=$(jq -r '[.artifacts[] | select(.type == "deb" or .type == "apk") | .name] | sort | "\(length): \(join(", "))"' "$OUT/$t-syft.json")
  read -r disk comp < <(docker images | awk -v i="$img" '$1 == i {print $3, $4}')
  R[$t,size]="$disk ($comp)"
  if [ "$(docker run --rm --entrypoint sh "$img" -c 'echo yes' 2>/dev/null)" = yes ]; then R[$t,shell]=yes; else R[$t,shell]=no; fi
  cid=$(docker run -d -p 127.0.0.1::8080 "$img"); sleep 2
  port=$(docker port "$cid" 8080/tcp | head -1 | sed 's/.*://')
  R[$t,hello]=$(curl -s --max-time 3 "127.0.0.1:$port")
  R[$t,user]=$(ps -o uid=,gid= -p "$(docker inspect -f '{{.State.Pid}}' "$cid")" | awk '{print $1":"$2}')
  docker rm -f "$cid" >/dev/null
  docker create --name q-bin "$img" >/dev/null && docker cp q-bin:/usr/local/bin/hello-server "/tmp/q-bin-$t" && docker rm q-bin >/dev/null
  R[$t,bin]=$(sha256sum < "/tmp/q-bin-$t" | cut -c1-16)
  # the scans, with the recorded databases
  grype "$img" --by-cve -q -o json > "$OUT/$t-grype.json"
  trivy image --skip-db-update --scanners vuln -q -f json -o "$OUT/$t-trivy.json" "$img"
  R[$t,grype]=$(jq -r '[.matches[] | {id: .vulnerability.id, os: (.artifact.type | IN("deb", "apk"))}] | "\(map(.id) | unique | length) (OS \(map(select(.os) | .id) | unique | length), Go \(map(select(.os | not) | .id) | unique | length))"' "$OUT/$t-grype.json")
  R[$t,trivy]=$(jq -r '[.Results[]? | .Class as $c | .Vulnerabilities[]? | {id: .VulnerabilityID, os: ($c == "os-pkgs")}] | "\(map(.id) | unique | length) (OS \(map(select(.os) | .id) | unique | length), Go \(map(select(.os | not) | .id) | unique | length))"' "$OUT/$t-trivy.json")
done
echo "Grype $(grype version 2>/dev/null | awk '/^Version/ {print $2}'), database $(grype db status 2>/dev/null | awk '/^Built/ {print $2}'); Trivy $(trivy --version | awk '/^Version/ {print $2}' | head -1), database $(trivy --version | awk '/UpdatedAt/ {print $2}' | head -1)"
echo
row() { printf '| %s | %s | %s |\n' "$1" "$2" "$3"; }
echo "| | C: Chainguard static | C-distroless: Google distroless static |"
echo "|---|---|---|"
row "Runtime base" "\`${BASE[c]%%@*}\`" "\`${BASE[c-distroless]%%@*}\`"
row "Base signature" "${R[c,sig]}" "${R[c-distroless,sig]}"
row "Base attestations" "${R[c,att]}" "${R[c-distroless,att]}"
row "Base build date, as recorded" "${R[c,created]}" "${R[c-distroless,created]}"
row "OS packages" "${R[c,pkgs]}" "${R[c-distroless,pkgs]}"
row "Size on disk (compressed)" "${R[c,size]}" "${R[c-distroless,size]}"
row "Runs as (uid:gid)" "${R[c,user]}" "${R[c-distroless,user]}"
row "Shell inside" "${R[c,shell]}" "${R[c-distroless,shell]}"
row "Answers" "${R[c,hello]}" "${R[c-distroless,hello]}"
row "App binary, SHA-256" "${R[c,bin]}…" "${R[c-distroless,bin]}…"
row "Grype, unique CVE IDs" "${R[c,grype]}" "${R[c-distroless,grype]}"
row "Trivy, unique CVE IDs" "${R[c,trivy]}" "${R[c-distroless,trivy]}"
