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
