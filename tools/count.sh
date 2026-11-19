#!/bin/bash
# tools/count.sh REPORT.json...: counts from Grype or Trivy JSON reports (the guide's jq queries, in one place).
#   findings     every match, including the same CVE found in several packages or Go programs
#   unique IDs   each vulnerability ID once
#   by severity  unique IDs, each counted once at its highest severity, so the numbers add up to "unique IDs"
#   by layer     unique (ID, layer) pairs: OS packages, Go modules, Go standard library
#   fixable      unique IDs that have a fixed version available
# Run on the build VM:  bash tools/count.sh reports/before/a-grype.json reports/before/a-trivy.json
for f in "$@"; do
  echo "== $f"
  if jq -e '.matches' "$f" >/dev/null 2>&1; then   # Grype
    jq -r '
      def rank: {"Critical":5,"High":4,"Medium":3,"Low":2,"Negligible":1,"Unknown":0}[.] // 0;
      "  findings:    \(.matches | length)",
      "  unique IDs:  \([.matches[].vulnerability.id] | unique | length)",
      "  by severity: " + ([.matches[] | {id: .vulnerability.id, s: .vulnerability.severity}] | group_by(.id) | map(max_by(.s | rank)) | group_by(.s) | sort_by(-(.[0].s | rank)) | map("\(.[0].s)=\(length)") | join("  ")),
      "  by layer:    " + ([.matches[] | {id: .vulnerability.id, w: (if .artifact.name == "stdlib" then "go-stdlib" elif .artifact.type == "go-module" then "go-module" else "os-" + .artifact.type end)}] | unique | group_by(.w) | map("\(.[0].w)=\(length)") | join("  ")),
      "  fixable:     \([.matches[] | select(.vulnerability.fix.state == "fixed") | .vulnerability.id] | unique | length)"
    ' "$f"
  else   # Trivy
    jq -r '
      def rank: {"CRITICAL":5,"HIGH":4,"MEDIUM":3,"LOW":2,"UNKNOWN":0}[.] // 0;
      "  findings:    \([.Results[]?.Vulnerabilities[]?] | length)",
      "  unique IDs:  \([.Results[]?.Vulnerabilities[]?.VulnerabilityID] | unique | length)",
      "  by severity: " + ([.Results[]?.Vulnerabilities[]? | {id: .VulnerabilityID, s: .Severity}] | group_by(.id) | map(max_by(.s | rank)) | group_by(.s) | sort_by(-(.[0].s | rank)) | map("\(.[0].s)=\(length)") | join("  ")),
      "  by layer:    " + ([.Results[]? | .Type as $t | .Vulnerabilities[]? | {id: .VulnerabilityID, w: (if .PkgName == "stdlib" then "go-stdlib" elif $t == "gobinary" then "go-module" else "os-" + $t end)}] | unique | group_by(.w) | map("\(.[0].w)=\(length)") | join("  ")),
      "  fixable:     \([.Results[]?.Vulnerabilities[]? | select((.FixedVersion // "") != "") | .VulnerabilityID] | unique | length)"
    ' "$f"
  fi
done
