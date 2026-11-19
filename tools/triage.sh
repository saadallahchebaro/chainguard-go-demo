#!/bin/bash
# tools/triage.sh GRYPE_JSON KEV_JSON [GOVULNCHECK_BINARY_JSON] [GOVULNCHECK_SOURCE_JSON] [N]
# Ranks unique CVEs for triage: on CISA's KEV list first, then vulnerable code present, then by EPSS
# (likelihood of exploitation in the next 30 days), then by severity.
#   KEV_JSON                 CISA's catalog (known_exploited_vulnerabilities.json): the primary source
#   GOVULNCHECK_BINARY_JSON  `govulncheck -mode binary -format json BIN`: is the vulnerable function IN the binary?
#   GOVULNCHECK_SOURCE_JSON  `govulncheck -format json ./...`: does our code CALL it? (modules only: source mode
#                            judges the standard library by the Go on the PATH, not the Go that built the binary)
# Columns: ID, severity, highest CVSS base score, EPSS (% and percentile), KEV, in binary, called, packages, fixed in.
G=$1; KEV=$2; GVB=${3:-}; GVS=${4:-}; N=${5:-12}
kev=$(jq -r '.vulnerabilities[].cveID' "$KEV")
symids() {   # IDs (with aliases) of findings that reached function level
  jq -s -r '([.[] | select(.osv) | .osv | {id, al: ([.id] + (.aliases // []))}]) as $osv
    | ([.[] | select(.finding) | .finding | select(.trace[0].function != null) | .osv] | unique) as $hit
    | [$osv[] | select(.id as $i | $hit | index($i) != null) | .al[]] | unique[]' "$1"
}
inbin=""; called=""
[ -n "$GVB" ] && inbin=$(symids "$GVB")
[ -n "$GVS" ] && called=$(symids "$GVS")
jq -r --arg kev "$kev" --arg inbin "$inbin" --arg called "$called" --arg hb "${GVB:+y}" --arg hs "${GVS:+y}" --argjson n "$N" '
  def rank: {"Critical":5,"High":4,"Medium":3,"Low":2,"Negligible":1,"Unknown":0}[.] // 0;
  ($kev | split("\n")) as $K | ($inbin | split("\n")) as $B | ($called | split("\n")) as $C
  | [.matches[] | {id: .vulnerability.id, sev: .vulnerability.severity,
      cvss: ([.vulnerability.cvss[]?.metrics.baseScore] | max),
      epss: ((.vulnerability.epss // [])[0].epss // 0), pct: ((.vulnerability.epss // [])[0].percentile // 0),
      pkg: (.artifact.name + " " + .artifact.version), go: (.artifact.type == "go-module"),
      std: (.artifact.name == "stdlib"), fix: ((.vulnerability.fix.versions // []) | join(","))}]
  | group_by(.id)
  | map(.[0].id as $i | {id: $i, sev: (max_by(.sev | rank).sev), cvss: (map(.cvss) | max), epss: (map(.epss) | max),
        pct: (map(.pct) | max), pkgs: (map(.pkg) | unique | join("; ")), fix: (map(.fix) | unique | map(select(. != "")) | join(" | ")),
        kev: (($K | index($i)) != null), go: (map(.go) | any), mod: (map(.go and (.std | not)) | any),
        inb: (($B | index($i)) != null), cal: (($C | index($i)) != null)})
  | sort_by([(if .kev then 0 else 1 end), (if .inb then 0 else 1 end), -.epss, -(.sev | rank)])
  | .[:$n][]
  | [.id, .sev, (if .cvss then (.cvss | tostring) else "-" end),
     ((.epss * 10000 | round / 100 | tostring) + "% p" + ((.pct * 100) | floor | tostring)),
     (if .kev then "KEV" else "-" end),
     (if (.go | not) then "n/a (OS)" elif $hb == "y" then (if .inb then "yes" else "no" end) else "?" end),
     (if (.mod | not) then "-" elif $hs == "y" then (if .cal then "yes" else "no" end) else "?" end),
     .pkgs, (if .fix == "" then "no fix" else .fix end)] | @tsv' "$G" \
| awk -F'\t' 'BEGIN { printf "%-15s %-8s %-4s %-14s %-3s %-9s %-6s %-40s %s\n", "ID", "SEVERITY", "CVSS", "EPSS", "KEV", "IN BINARY", "CALLED", "PACKAGE", "FIXED IN" }
              { printf "%-15s %-8s %-4s %-14s %-3s %-9s %-6s %-40.40s %s\n", $1, $2, $3, $4, $5, $6, $7, $8, $9 }'
echo "IN BINARY: govulncheck binary mode found the vulnerable function in the shipped binary. CALLED: source mode found a call path from our code (modules only; '-' = not a module)."
