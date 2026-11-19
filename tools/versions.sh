#!/bin/bash
# tools/versions.sh: one line per tool with its version, for REPORT.md section 2 and the scan method.
# Run on the build VM:  bash tools/versions.sh
v() { printf '%-12s %s\n' "$1" "${2:-not installed}"; }
v "ubuntu"      "$(. /etc/os-release && echo "$VERSION")"
v "kernel"      "$(uname -r) ($(uname -m))"
v "docker"      "$(docker version --format '{{.Server.Version}}' 2>/dev/null)"
v "containerd"  "$(docker version --format '{{range .Server.Components}}{{if eq .Name "containerd"}}{{.Version}}{{end}}{{end}}' 2>/dev/null)"
v "buildx"      "$(docker buildx version 2>/dev/null | awk '{print $2}')"
v "go"          "$(go env GOVERSION 2>/dev/null)"
v "grype"       "$(grype version 2>/dev/null | awk '/^Version:/{print $2}')"
v "syft"        "$(syft version 2>/dev/null | awk '/^Version:/{print $2}')"
v "trivy"       "$(trivy --version 2>/dev/null | awk '/^Version:/{print $2; exit}')"
v "govulncheck" "$(govulncheck -version 2>/dev/null | awk -F@ '/^Scanner:/{print $2}')"
v "cosign"      "$(cosign version 2>/dev/null | awk '/^GitVersion:/{print $2}')"
v "crane"       "$(crane version 2>/dev/null)"
v "kubectl"     "$(kubectl version --client 2>/dev/null | awk '/^Client Version:/{print $3}')"
