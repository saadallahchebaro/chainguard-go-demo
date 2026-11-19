#!/usr/bin/env bash
# tools/make-showcase.sh: build showcase/, one folder of the files worth opening during the talk, grouped and
# numbered. Every entry is a relative symbolic link to the real file, so nothing is copied and nothing can drift.
# Run from the repo root; it rebuilds showcase/ from scratch.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
S=showcase
rm -rf "$S"; mkdir -p "$S"

link() {   # link <folder> <target in the repo> [name]
  local dir="$S/$1" target="$2" name="${3:-$(basename "$2")}"
  [ -e "$target" ] || { echo "missing: $target" >&2; return 1; }
  mkdir -p "$dir"
  ln -s "$(realpath --relative-to="$dir" "$target")" "$dir/$name"
}

link 01-dockerfiles dockerfiles/Dockerfile.a-single     A-single-stage.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.b-multi      B-multi-stage-debian.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.c-chainguard C-chainguard-runtime.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.c-distroless C-experiment-on-distroless-static.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.d-updated    D-chainguard-builder-updated-modules.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.e-patched    E-chainguard-builder-patched-app.Dockerfile
link 01-dockerfiles dockerfiles/Dockerfile.e-golang     E-experiment-on-golang-latest.Dockerfile
link 01-dockerfiles ci/hello-ai/Dockerfile              hello-ai.Dockerfile

link 02-app-source go/main.go         main-original.go
link 02-app-source go-patched/main.go main-patched.go
link 02-app-source go-updated/main.go main-in-d-unchanged.go
link 02-app-source go/go.mod          go-original.mod
link 02-app-source go-patched/go.mod  go-patched.mod

link 03-scan-reports reports/final/comparison.md
link 03-scan-reports reports/final/scanner-versions.txt
link 03-scan-reports reports/distroless/comparison.md chainguard-static-vs-distroless.md
for i in a b c d e; do
  link 03-scan-reports reports/final/$i-grype.txt
  link 03-scan-reports reports/final/$i-trivy.txt
done
link 03-scan-reports reports/final/govulncheck-binary-abc.txt
link 03-scan-reports reports/final/govulncheck-binary-d.txt
link 03-scan-reports reports/final/govulncheck-binary-e.txt
link 03-scan-reports results.json

for i in a b c d e; do link 04-sbom sbom/$i.spdx.json; done
link 04-sbom sbom/chainguard-static-arm64.spdx.json

link 05-signing-provenance cosign.pub
link 05-signing-provenance reports/signing/e-cosign-tree.txt
link 05-signing-provenance reports/signing/e-verify.json
link 05-signing-provenance reports/signing/e-sbom-attestation-statement.json
link 05-signing-provenance reports/provenance/e-buildkit-provenance.json
link 05-signing-provenance reports/provenance/chainguard-static-slsa.json
link 05-signing-provenance reports/provenance/chainguard-go-slsa.json

link 06-kubernetes k8s/deployment.yaml               hello-deployment.yaml
link 06-kubernetes k8s/service.yaml                  hello-service.yaml
link 06-kubernetes ci/hello-ai/k8s/deployment.yaml   hello-ai-deployment.yaml
link 06-kubernetes ci/hello-ai/policy/require-signature.yaml

link 07-pipeline ci/hello-ai/gate.sh
link 07-pipeline ci/hello-ai/deploy.sh
link 07-pipeline ci/hello-ai/.github/workflows/gate.yml
link 07-pipeline ci/hello-ai/.github/workflows/deploy.yml
link 07-pipeline ci/git-hook/pre-receive

link 08-agent-and-skills ci/agent-runs/README.md                          agent-runs.md
link 08-agent-and-skills ci/agent-runs/live-run-2026-11-17.txt
link 08-agent-and-skills ci/skills/README.md                              skills.md
link 08-agent-and-skills ci/skills/skill-gate.sh
link 08-agent-and-skills ci/skills/vetted/chainguard-dockerfile/SKILL.md  vetted-chainguard-dockerfile.SKILL.md
link 08-agent-and-skills ci/skills/unvetted/dockerfile-fixer/SKILL.md     compromised-dockerfile-fixer.SKILL.md
link 08-agent-and-skills ci/skills/unvetted/dockerfile-fixer/scripts/setup.sh compromised-setup.sh
link 08-agent-and-skills reports/skills/dockerfile-fixer.txt              scan-dockerfile-fixer-blocked.txt
link 08-agent-and-skills reports/skills/chainguard-dockerfile.txt         scan-chainguard-dockerfile-allowed.txt

link 09-lab-notes README.md
link 09-lab-notes REPORT.md
link 09-lab-notes JOURNAL.md
link 09-lab-notes RUNBOOK.md

cat > "$S/README.md" <<'EOF'
# Showcase: the files worth opening

Every file here is a link to the real one elsewhere in the repo, grouped in the order of the talk. Open them from here; edit them where they live.

| Folder | What's in it |
|---|---|
| `01-dockerfiles` | Images A to E, the E-on-golang and C-on-distroless experiments, and hello-ai's Dockerfile as merged |
| `02-app-source` | `main.go` and `go.mod`, before and after the patch |
| `03-scan-reports` | The final same-day rescan: the comparison table, Chainguard's static base against Google's distroless (measured), Grype and Trivy for A to E, govulncheck, the scanner versions, `results.json` |
| `04-sbom` | The SPDX SBOMs of A to E, and Chainguard's own for its static image |
| `05-signing-provenance` | The lab's public key, E's signature tree and verification, its SBOM attestation, E's provenance and Chainguard's |
| `06-kubernetes` | The Deployments, the Service and the Kyverno admission policy |
| `07-pipeline` | `gate.sh`, `deploy.sh`, the two GitHub workflows and the Git-hook fallback |
| `08-agent-and-skills` | The agent's runs, the live run of 17 November, the skill gate and both skills with their scans |
| `09-lab-notes` | README, REPORT, JOURNAL and RUNBOOK |

Rebuilt by `tools/make-showcase.sh`.
EOF
echo "showcase/: $(find "$S" -type l | wc -l) links in $(find "$S" -mindepth 1 -type d | wc -l) folders; broken links: $(find -L "$S" -type l | wc -l)"
