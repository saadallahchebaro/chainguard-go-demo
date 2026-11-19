#!/bin/bash
# tools/gap-analysis.sh BINARY GRYPE_JSON TRIVY_JSON
# Explains why Trivy reports Go vulnerabilities that Grype doesn't, for one Go binary.
# For every ID only Trivy reports (modules and standard library separately), it checks, using Go's
# vulnerability database (via govulncheck) and the binary's own symbol table (go tool nm):
#   pkg-absent   the affected package isn't compiled into the binary
#   fn-absent    the package is compiled in, but none of the vulnerable functions are
#   fn-present   a vulnerable function is in the binary (not explained by symbol filtering)
#   no-data      Go's vulnerability database has no package information for it
# Grype (v0.121.3, grype/pkg/qualifier/gosymbols) reports a Go vulnerability in a binary only when the
# binary contains a vulnerable symbol; Trivy matches by module version. Run on the build VM.
set -euo pipefail
BIN=$1; G=$2; T=$3
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
govulncheck -mode binary -format json "$BIN" > "$TMP/gv.json" || true
go tool nm "$BIN" | awk '{print $NF}' > "$TMP/nm.txt"
jq -s '[.[] | select(.osv) | .osv | {ids: ([.id] + (.aliases // [])), imp: [.affected[]? | .ecosystem_specific.imports[]? | {p: .path, s: (.symbols // [])}]}]' "$TMP/gv.json" > "$TMP/osv.json"

classify() {   # $1 = ID
  rows=$(jq -r --arg i "$1" '[.[] | select(.ids|index($i)) | .imp[] | .p as $p | (if (.s|length)==0 then "\($p)|*" else (.s[] | "\($p)|\(.)") end)] | unique[]' "$TMP/osv.json")
  [ -z "$rows" ] && { echo no-data; return; }
  anypkg=0; anysym=0
  for r in $rows; do
    p=${r%%|*}; s=${r#*|}
    grep -q "^$p\." "$TMP/nm.txt" && anypkg=1
    if [ "$s" = "*" ]; then grep -q "^$p\." "$TMP/nm.txt" && anysym=1
    else ty=${s%%.*}; fn=${s#*.}
      if [ "$fn" = "$s" ]; then grep -qx -F "$p.$s" "$TMP/nm.txt" && anysym=1
      else grep -q -F -e "$p.$ty.$fn" -e "$p.(*$ty).$fn" "$TMP/nm.txt" && anysym=1; fi
    fi
  done
  if [ $anypkg = 0 ]; then echo pkg-absent; elif [ $anysym = 0 ]; then echo fn-absent; else echo fn-present; fi
}

for scope in modules stdlib; do
  if [ $scope = stdlib ]; then gsel='.artifact.name=="stdlib"'; tsel='.PkgName=="stdlib"'; else gsel='.artifact.type=="go-module" and .artifact.name!="stdlib"'; tsel='.PkgName!="stdlib"'; fi
  g=$(jq -r "[.matches[] | select($gsel) | .vulnerability.id] | unique[]" "$G" | sort)
  t=$(jq -r "[.Results[]? | select(.Type==\"gobinary\") | .Vulnerabilities[]? | select($tsel) | .VulnerabilityID] | unique[]" "$T" | sort)
  only=$(comm -23 <(echo "$t") <(echo "$g"))
  declare -A n=([pkg-absent]=0 [fn-absent]=0 [fn-present]=0 [no-data]=0); present=""
  for id in $only; do c=$(classify "$id"); n[$c]=$((n[$c]+1)); [ "$c" = fn-present ] && present="$present $id"; done
  printf '%-8s Grype %3d  Trivy %3d  Trivy-only %3d -> pkg-absent %d, fn-absent %d, fn-present %d%s, no-data %d\n' \
    "$scope" "$(echo "$g" | grep -c . || true)" "$(echo "$t" | grep -c . || true)" "$(echo "$only" | grep -c . || true)" \
    "${n[pkg-absent]}" "${n[fn-absent]}" "${n[fn-present]}" "${present:+ (}${present# }${present:+)}" "${n[no-data]}"
done
