#!/bin/bash
# tools/results.sh [DIR]: builds results.json and the comparison tables from the same-day rescan.
# Every number the README, the report and the deck show comes from here, never typed by hand.
# Run on the build VM from the repo folder, after the rescan:   bash tools/results.sh
# It writes results.json, prints the two summary tables, and has tools/comparison.py write DIR/comparison.md (the
# images, Grype's counts, and Grype against Trivy ID by ID). DIR defaults to reports/final.
#
# What each number is:
#   grype, trivy   unique vulnerability IDs, each counted once at its highest severity (as tools/count.sh);
#                  by_layer counts unique (ID, layer) pairs; fixable = unique IDs with a fixed version
#   kev            unique IDs (Grype's report) on the CISA KEV catalog saved with the rescan (DIR/cisa-kev.json)
#   govulncheck    known vulnerabilities govulncheck (binary mode) finds in the app binary each image ships
#   size           the two sizes `docker images` reports: unpacked on disk, and compressed
#   packages       OS packages (deb or apk), and Go modules compiled into the app binary, from Trivy's package lists
#   user           the image config's user; runs_as = the uid:gid the app process really has (ps on the VM)
#   shell          whether `sh` starts inside the image; hello_world = whether it answers "Hello World!"
set -euo pipefail
DIR=${1:-reports/final}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
declare -A FILE=([a]=a-single [b]=b-multi [c]=c-chainguard [d]=d-updated [e]=e-patched)
declare -A CODE=([a]=original [b]=original [c]=original [d]="original app, updated modules" [e]="patched app, updated modules")
declare -A GVBIN=([a]=abc [b]=abc [c]=abc [d]=d [e]=e)   # A, B and C ship the same binary (SHA-256 compared at step 11)
jq -c '[.vulnerabilities[].cveID]' "$DIR/cisa-kev.json" > "$TMP/kev.json"
base() { sed -E 's/@sha256:[0-9a-f]+//; s/:latest$//'; }

for t in a b c d e; do
  img=hello:$t; df=dockerfiles/Dockerfile.${FILE[$t]}
  build=$(grep -m1 '^FROM' "$df" | awk '{print $2}' | base)
  runtime=$(grep '^FROM' "$df" | tail -1 | awk '{print $2}' | base)
  [ "$t" = a ] && runtime="(same image: single stage)"
  read -r disk comp < <(docker images | awk -v i="$img" '$1==i {print $3, $4}')
  id=$(docker image inspect "$img" --format '{{.Id}}')
  user=$(docker image inspect "$img" --format '{{.Config.User}}')
  if [ "$(docker run --rm --entrypoint sh "$img" -c 'echo yes' 2>/dev/null)" = yes ]; then shell=true; else shell=false; fi
  cid=$(docker run -d -p 127.0.0.1::8080 "$img"); sleep 2
  port=$(docker port "$cid" 8080/tcp | head -1 | sed 's/.*://')
  if [ "$(curl -s --max-time 3 "127.0.0.1:$port")" = "Hello World!" ]; then hello=true; else hello=false; fi
  runs_as=$(ps -o uid=,gid= -p "$(docker inspect -f '{{.State.Pid}}' "$cid")" | awk '{print $1":"$2}')
  docker rm -f "$cid" >/dev/null
  gv=$(grep -oE 'affected by [0-9]+ vulnerabilit' "$DIR/govulncheck-binary-${GVBIN[$t]}.txt" | grep -oE '[0-9]+' || echo 0)

  jq --slurpfile kev "$TMP/kev.json" '
    def rank: {"Critical":5,"High":4,"Medium":3,"Low":2,"Negligible":1,"Unknown":0}[.] // 0;
    def layer: if .artifact.name == "stdlib" then "go_stdlib" elif .artifact.type == "go-module" then "go_module"
               elif (.artifact.type | IN("deb", "apk", "rpm")) then "os_packages"
               elif .artifact.type == "binary" then "go_toolchain" else "other_" + .artifact.type end;
    [.matches[] | {id: .vulnerability.id, s: .vulnerability.severity, w: layer, fix: (.vulnerability.fix.state == "fixed")}] as $m
    | ($m | group_by(.id) | map(max_by(.s | rank))) as $u
    | def n(s): [$u[] | select(.s == s)] | length;
      {unique: ($u | length), critical: n("Critical"), high: n("High"), medium: n("Medium"), low: n("Low"),
       negligible: n("Negligible"), unknown: n("Unknown"),
       by_layer: ($m | map({id, w}) | unique | group_by(.w) | map({key: .[0].w, value: length}) | from_entries),
       fixable: ([$m[] | select(.fix) | .id] | unique | length),
       kev_ids: [$u[].id | select(. as $i | $kev[0] | index($i) != null)]}
    | .kev = (.kev_ids | length)' "$DIR/$t-grype.json" > "$TMP/$t-g.json"

  jq '
    def rank: {"CRITICAL":5,"HIGH":4,"MEDIUM":3,"LOW":2,"UNKNOWN":0}[.] // 0;
    [.Results[]? | .Class as $c | .Type as $ty | .Vulnerabilities[]? | {id: .VulnerabilityID, s: .Severity,
       w: (if .PkgName == "stdlib" then "go_stdlib" elif $ty == "gobinary" then "go_module" elif $c == "os-pkgs" then "os_packages" else "other_" + $ty end),
       fix: ((.FixedVersion // "") != "")}] as $m
    | ($m | group_by(.id) | map(max_by(.s | rank))) as $u
    | def n(s): [$u[] | select(.s == s)] | length;
      [.Results[]? | select(.Type == "gobinary" and (.Target | endswith("hello-server")))][0] as $app
    | {unique: ($u | length), critical: n("CRITICAL"), high: n("HIGH"), medium: n("MEDIUM"), low: n("LOW"), unknown: n("UNKNOWN"),
       by_layer: ($m | map({id, w}) | unique | group_by(.w) | map({key: .[0].w, value: length}) | from_entries),
       fixable: ([$m[] | select(.fix) | .id] | unique | length),
       packages: {os: ([.Results[]? | select(.Class == "os-pkgs") | .Packages[]?] | length),
                  os_type: ([.Results[]? | select(.Class == "os-pkgs") | .Type][0]),
                  app_go_version: ([$app.Packages[]? | select(.Name == "stdlib") | .Version][0]),
                  app_go_modules: ([$app.Packages[]? | select(.Name != "stdlib" and (.Version // "") != "")] | length)}}' \
    "$DIR/$t-trivy.json" > "$TMP/$t-t.json"

  jq -n --arg t "$t" --arg img "$img" --arg id "$id" --arg build "$build" --arg runtime "$runtime" --arg code "${CODE[$t]}" \
        --arg disk "$disk" --arg comp "$comp" --arg user "${user:-(not set: root)}" --arg runs_as "$runs_as" \
        --argjson shell "$shell" --argjson hello "$hello" --argjson gv "$gv" \
        --slurpfile g "$TMP/$t-g.json" --slurpfile tr "$TMP/$t-t.json" '
    {($t): {tag: $img, image_id: $id, build_stage: $build, runtime_base: $runtime, code: $code,
            size: {disk: $disk, compressed: $comp}, packages: $tr[0].packages,
            user: {config: $user, runs_as: $runs_as}, shell: $shell, hello_world: $hello,
            grype: $g[0], trivy: ($tr[0] | del(.packages)), govulncheck_binary: $gv}}' > "$TMP/$t.json"
done

jq -n --arg dir "$DIR" --slurpfile s "$DIR/scanners.json" \
      --slurpfile a "$TMP/a.json" --slurpfile b "$TMP/b.json" --slurpfile c "$TMP/c.json" --slurpfile d "$TMP/d.json" --slurpfile e "$TMP/e.json" '
  {generated_by: "tools/results.sh", source: $dir, scanners: $s[0],
   counting: "Unique vulnerability IDs (Grype with --by-cve), each counted once at its highest severity; by_layer counts unique (ID, layer) pairs. Fixed and unfixed both counted.",
   images: ($a[0] + $b[0] + $c[0] + $d[0] + $e[0])}' > results.json

jq -r '
  def yn: if . then "yes" else "no" end;
  def who: if .user.runs_as == "0:0" then "root (0:0)" else .user.runs_as end;
  "Scanned \(.scanners.scanned_on): Grype \(.scanners.grype.version) (database built \(.scanners.grype.db_built)), Trivy \(.scanners.trivy.version) (database updated \(.scanners.trivy.db_updated)), CISA KEV catalog \(.scanners.kev_catalog.catalogVersion). Image D, built at step 37, was scanned on 17 November against the same databases. Unique CVE IDs, each at its highest severity (Grype).",
  "",
  "| Image | Build stage | Runtime base | Code | Size on disk (compressed) | OS packages | Go modules in the binary | Critical | High | Medium | Low | Negligible | Unknown | Unique CVEs: Grype (Trivy) | On KEV | govulncheck | Runs as | Shell | Hello World! |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  (.images | to_entries[] | .key as $k | .value |
    "| \($k | ascii_upcase) | `\(.build_stage)` | \(if $k == "a" then .runtime_base else "`" + .runtime_base + "`" end) | \(.code) | \(.size.disk) (\(.size.compressed)) | \(.packages.os) \(.packages.os_type) | \(.packages.app_go_modules) (Go \(.packages.app_go_version)) | \(.grype.critical) | \(.grype.high) | \(.grype.medium) | \(.grype.low) | \(.grype.negligible) | \(.grype.unknown) | **\(.grype.unique)** (\(.trivy.unique)) | \(.grype.kev) | \(.govulncheck_binary) | \(who) | \(.shell | yn) | \(.hello_world | yn) |"),
  "",
  "| Grype, unique IDs by layer | A | B | C | D | E |",
  "|---|---|---|---|---|---|",
  (.images as $i | ["os_packages", "go_toolchain", "go_stdlib", "go_module"][] as $l
    | {os_packages: "1. OS packages", go_toolchain: "2. Build tools (the Go toolchain, image A)", go_stdlib: "3. Go standard library (every Go program in the image)", go_module: "4. Go modules"}[$l] as $name
    | "| \($name) | " + ([$i[] | .grype.by_layer[$l] // 0 | tostring] | join(" | ")) + " |"),
  (.images as $i | "| **Total (unique IDs)** | " + ([$i[] | "**\(.grype.unique)**"] | join(" | ")) + " |")
' results.json
python3 tools/comparison.py "$DIR"
