# Container security report: the Go hello-server, from image A to image E

Findings and methodology for the Chainguard Solutions Engineer technical challenge. Each section is filled in as the lab step that produces it finishes. The raw evidence is in `reports/`, `sbom/` and `logs/`, and every command is in `RUNBOOK.md`.

## 1. Summary
*(Filled at step 14, rewritten at step 22.)*

**From 734 known CVEs to 0, plus three code issues fixed that no scanner reports.** The Go hello-server, packaged five ways and rescanned against the same databases (A, B, C and E on 2026-11-16; D, built at step 37, on 2026-11-17):

- **A**, one stage on `golang:1.18`: 1.49 GB, 201 Debian packages, root, a shell; **734** unique CVEs (46 Critical), 3 of them on CISA's KEV list.
- **B**, multi-stage onto `debian:trixie-slim`: 155 MB, 78 packages; non-root, but in group root, with a shell and apt still inside; **161** CVEs.
- **C**, one line changed, the runtime base becomes `cgr.dev/chainguard/static`: 19 MB, 3 packages, no shell, 65532:65532; **69** CVEs, every one inside the Go binary, which is byte for byte A's and B's.
- **D**, the dependencies updated: built with Go 1.27.4 on `cgr.dev/chainguard/go`, every module updated, the app's own code and settings as delivered: 34.9 MB, **0** in Grype, Trivy and govulncheck, yet still in Gin's debug mode, trusting every proxy, with no server timeouts.
- **E**, the app fixed: D plus three changes to the app's code and settings (release mode, no trusted proxies, server timeouts), each tested on D and E side by side: 34.9 MB, **0**, the same scan as D. E is the image that is signed and deployed. Until step 37 it was called D.
- **Who removed what:** the base image removed the OS layer (92 → 0); the app layer took a toolchain and dependency update (69 → 0, image D); the app's own code and settings took a fix no scanner measures (image E). The builder's brand doesn't change what ships (Docker's `golang:latest` gives the same zero) but it changes the build environment: 325 CVEs, one on KEV, in `golang:latest` against 0 in `chainguard/go`.

## 2. Scope and environment

**Scope.** The Go application in `go/`: 15 lines of Go serving "Hello World!" with Gin v1.8.1. `go.mod` pins 1 direct and 18 indirect modules; the binary built with Go 1.18.10 carries 15 of them (four are only compiled in under build tags). It's packaged as five images, each changing one thing:

| Image | Builder | Runtime base | App code | What changed |
|---|---|---|---|---|
| A | `golang:1.18` | the same image (single stage) | original | starting point |
| B | `golang:1.18` | `debian:trixie-slim` | original | multi-stage build |
| C | `golang:1.18` | `cgr.dev/chainguard/static` | original | runtime base only |
| D | `cgr.dev/chainguard/go` | `cgr.dev/chainguard/static` | updated `go.mod`; original `main.go` | toolchain and dependencies |
| E | `cgr.dev/chainguard/go` | `cgr.dev/chainguard/static` | updated `go.mod`; patched `main.go`; `GIN_MODE=release` | the app's own code and settings |

An optional extra build, E-golang (built at step 13 as D-golang), is image E with Docker's `golang:latest` as the builder: it isolates what the builder's brand changes.

**Environment.** *(Filled at steps 00–05.)*

| Component | Choice | Version | Why |
|---|---|---|---|
| Host | Apple Silicon Mac (arm64), 10 CPUs, 16 GB | macOS 26.7.3 | The machine available. It has no Linux kernel, so the lab runs in Linux VMs |
| Virtualization | Multipass, QEMU driver | 1.17.1 | One command per Ubuntu VM, scriptable (`launch`, `exec`, `transfer`), free; the brief asks for a VM |
| Build VM | Ubuntu 24.04, 4 CPUs, 4 GB, 30 GB | 24.04.5 LTS, arm64 | A current LTS with Docker's own apt repository; sized for compiling Gin and loading scanner databases one at a time |
| Container engine | Docker Engine (`docker-ce`) from Docker's apt repository; standard install (daemon runs as root, user in the `docker` group) | 29.9.3; containerd 2.4.2; runc 1.5.3; buildx 0.39.0 | What most customers' pipelines run, so the lab maps onto theirs. Docker's own build, matching its documentation. Images are stored through containerd (`io.containerd.snapshotter.v1`). The root daemon is a deliberate trade-off: the lab VM is single-user and its user already has `sudo`. In production, builds shouldn't run as root on the host (see §8) |
| Docker daemon DNS | `/etc/docker/daemon.json`: `1.1.1.1`, `8.8.8.8` | — | Containers get only the VM's IPv4 DNS server, which the Mac's network tooling leaves unanswered. Without this, builds can't download modules (journal, surprise 9). In a company: its internal resolvers |
| Scanners | Grype (primary), Trivy (second opinion), govulncheck | Grype 0.121.3; Trivy 0.76.2; govulncheck v1.9.0 | Grype and Trivy use different databases and matching, so two opinions show where results differ; govulncheck shows which vulnerable functions the app actually calls. Grype verified with cosign against Anchore's release workflow. Trivy's package verified with cosign against Aqua's release workflow at tag v0.76.2, because Trivy's own release pipeline was compromised in March 2026 (0.69.4–0.69.6) |
| SBOM | Syft | 1.57.1 | The same company and package catalogue as Grype, so SBOM and scan agree on what's in the image. Verified with cosign |
| Signing | cosign | v3.1.4 | The Sigstore standard tool; verifies the tools' and Chainguard's signatures and signs our images |
| Go toolchain | Go from go.dev | 1.27.4 | To rebuild the app with a current standard library (images D and E). Verified against go.dev's SHA-256 |
| Registry inspection | crane (go-containerregistry) | v0.22.1 | Reads manifests and digests straight from registries |
| Kubernetes (bonus) | k3s on a second Multipass VM (`k3s`, 2 CPUs, 3 GB, 15 GB, 192.168.252.3); kubectl on the build VM | k3s v1.37.2+k3s1 (containerd 2.3.7); kubectl v1.37.2 | A certified Kubernetes in one binary, sized for a small VM; on its own VM it pulls from the registry over the network like a real cluster. Pinned to the version that matches kubectl. The registry is declared as plain HTTP in `registries.yaml` before the install |

## 3. Method
*(Filled at step 09; confirmed at step 14.)*

- **Scanners and databases.** Grype 0.121.3 (primary) and Trivy 0.76.2 (second opinion). Each report records its database: for the "before" scans, Grype's schema v6.1.10 built 2026-11-16 06:30 UTC and Trivy's v2 updated 2026-11-16 07:10 UTC (`reports/before/scanner-versions.txt`). Results move as databases update, so the final table comes from a same-day rescan of the four images built by then (step 14, 2026-11-16 13:46 UTC, `reports/final/scanners.json`); D, built at step 37, was scanned against the same databases. At that point neither scanner had a newer database, so every scan in this report, before, after and final, ran against the same Grype and Trivy data, and the rescan reproduced each earlier count exactly. The CISA KEV catalog (2026.11.13, 1,781 entries) was downloaded again for the rescan.
- **What's counted.** Unique vulnerability IDs: Grype runs with `--by-cve`, so it uses the CVE ID wherever one exists, as Trivy does. Each ID is counted once, at its highest severity, so the severity columns add up to the total. Fixed and unfixed findings are both counted; "fixable" means a fixed version exists. Counting is scripted: `tools/count.sh` for single reports, and `tools/results.sh` for the final tables and `results.json`.
- **Layers.** Each finding is assigned to OS packages, the Go standard library or Go modules, from the scanner's package type. For the standard library, the app's own binary is what's compared across images (surprise 13).
- **Grype against Trivy, ID by ID.** `reports/final/comparison.md` (written by `tools/comparison.py`) shows, for each image, the IDs both scanners report, the ones only one reports, and why, with every differing ID listed by package. A: 709 both, 25 only Grype, 10,147 only Trivy; B: 160, 1 and 93; C: 68, 1 and 89; D and E: none.
- **Known scanner differences, stated rather than hidden.** Trivy matches kernel CVEs against the `linux-libc-dev` headers package; Grype doesn't (`match-upstream-kernel-headers: false`). That alone explains 9,928 of the gap on image A.
- **Why Grype and Trivy differ on Go.** On a Go binary, Grype reports a vulnerability only when the binary contains a vulnerable function (its `gosymbols` qualifier, using Go's vulnerability database); Trivy matches by module version, as Grype does on `go.mod`. `tools/gap-analysis.sh` explains 91 of the 92 Go IDs only Trivy reports on image B this way. Grype on the binary is the primary count.
- **Triage order.** On CISA's KEV list first (catalog 2026.11.13), then whether the vulnerable function is in the shipped binary (govulncheck binary mode), then EPSS, then severity (`tools/triage.sh`). "In the binary", "called" (govulncheck source mode) and "exposed" (tested against the running server) are reported separately.
- **Reachability.** govulncheck runs in source mode ("does our code call it", judged with the current Go) and in binary mode on the shipped binary ("what actually shipped", judged with the Go that built it).
- **Image scans, not SBOM scans, for the counts.** On a Go binary, Grype's count from the image is function-level; from an SBOM it can only be module-level, because the SBOM records module versions but not the functions compiled in. For image C that's 69 against 158 (step 15, F23). Every count in this report is from images.
- **Formats.** Every scan is saved as JSON (the evidence the counts come from), SARIF (for code-scanning tools) and a readable table. The largest image-A files are committed gzip-compressed.

## 4. Results
*(Final: the same-day rescan of step 14. The two tables below are generated by `tools/results.sh` from `reports/final/`.)*

Scanned 2026-11-16T13:45:55Z: Grype 0.121.3 (database built 2026-11-16T06:30:54Z), Trivy 0.76.2 (database updated 2026-11-16T07:10:39.763774809Z), CISA KEV catalog 2026.11.13. Image D, built at step 37, was scanned on 17 November against the same databases. Unique CVE IDs, each at its highest severity (Grype).

| Image | Build stage | Runtime base | Code | Size on disk (compressed) | OS packages | Go modules in the binary | Critical | High | Medium | Low | Negligible | Unknown | Unique CVEs: Grype (Trivy) | On KEV | govulncheck | Runs as | Shell | Hello World! |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | `golang:1.18` | (same image: single stage) | original | 1.49GB (374MB) | 201 debian | 15 (Go v1.18.10) | 46 | 225 | 230 | 38 | 194 | 1 | **734** (10856) | 3 | 62 | root (0:0) | yes | yes |
| B | `golang:1.18` | `debian:trixie-slim` | original | 155MB (35.4MB) | 78 debian | 15 (Go v1.18.10) | 5 | 55 | 59 | 9 | 26 | 7 | **161** (253) | 1 | 62 | 65532:0 | yes | yes |
| C | `golang:1.18` | `cgr.dev/chainguard/static` | original | 19MB (5.62MB) | 3 wolfi | 15 (Go v1.18.10) | 5 | 36 | 26 | 1 | 0 | 1 | **69** (157) | 1 | 62 | 65532:65532 | no | yes |
| D | `cgr.dev/chainguard/go` | `cgr.dev/chainguard/static` | original app, updated modules | 34.9MB (11MB) | 3 wolfi | 19 (Go v1.27.4) | 0 | 0 | 0 | 0 | 0 | 0 | **0** (0) | 0 | 0 | 65532:65532 | no | yes |
| E | `cgr.dev/chainguard/go` | `cgr.dev/chainguard/static` | patched app, updated modules | 34.9MB (11MB) | 3 wolfi | 19 (Go v1.27.4) | 0 | 0 | 0 | 0 | 0 | 0 | **0** (0) | 0 | 0 | 65532:65532 | no | yes |

| Grype, unique IDs by layer | A | B | C | D | E |
|---|---|---|---|---|---|
| 1. OS packages | 603 | 92 | 0 | 0 | 0 |
| 2. Build tools (the Go toolchain, image A) | 118 | 0 | 0 | 0 | 0 |
| 3. Go standard library (every Go program in the image) | 87 | 60 | 60 | 0 | 0 |
| 4. Go modules | 17 | 17 | 17 | 0 | 0 |
| **Total (unique IDs)** | **734** | **161** | **69** | **0** | **0** |

- **Image A's standard-library count (87)** includes the Go toolchain's own programs, which A ships. On the app binary alone it's 60, the same as B and C (journal, surprise 13).
- **On KEV** (CISA catalog 2026.11.13): A carries CVE-2023-44487 (HTTP/2 Rapid Reset), CVE-2023-4911 (glibc) and CVE-2025-48384 (Git); B and C carry CVE-2023-44487, in the binary's `x/net`; D and E none.
- **govulncheck** counts the known vulnerabilities it finds in the binary each image ships (binary mode). A, B and C ship the same binary.
- **Fixable** (a fixed version exists), Grype: A 374, B 72, C 69, D 0, E 0.

D's and E's zeros were checked, not assumed: Syft, Grype and Trivy all saw their 3 Wolfi packages and the 21 Go packages in each binary (19 modules, the standard library, the app) and matched none of them.

Every Critical left in B (5) is in layers 3–4, inside the binary (journal F14). govulncheck: B's shipped binary can reach 62 known vulnerabilities, 49 of them in Go 1.18's standard library (F15).

**Run checks.** Each image is started with `docker run -d -p 8080:8080`, then checked with `curl`, `id` inside the container, a shell test and both sizes.

| Image | Answers `curl` | User | Shell | Size on disk | Compressed |
|---|---|---|---|---|---|
| A | Hello World! | root (`uid=0`) | yes | 1.49 GB | 374 MB |
| B | Hello World! | `uid=65532`, but `gid=0` (root's group) | yes | 155 MB | 35.4 MB |
| C | Hello World! | 65532:65532 (from `ps` on the VM; no `id` inside) | no | 19 MB | 5.62 MB |
| D | Hello World! | 65532:65532 (from `ps` on the VM; no `id` inside) | no | 34.9 MB | 11 MB |
| E | Hello World! | 65532:65532 (from `ps` on the VM; no `id` inside) | no | 34.9 MB | 11 MB |

**On Kubernetes** (step 19, when E was called D): E runs as two replicas on k3s v1.37.2, pulled by its signed digest, in a namespace that enforces the restricted Pod Security level. On the node, each container runs as 65532:65532 with a read-only root filesystem, no capabilities, no privilege escalation, the default seccomp filter and memory and CPU limits; it answers "Hello World!" through the Service, has no shell to exec into, and a deleted pod is replaced within seconds. The manifests, `k8s/deployment.yaml` and `k8s/service.yaml`, are what the cluster runs: a server-side dry run reports both unchanged, and `kubectl diff` finds no difference (step 32).

**In a pipeline** (step 20, bonus beyond the brief): a seven-check gate on every pull request, run by a self-hosted runner on the build VM; on merge, the same gate, then push, sign and deploy; a Kyverno policy admits only images signed with the lab key. An unpinned dependency turned a pull request red, and pinning every package turned it green; an image pushed around the gate was refused by the cluster. A coding agent's unguarded change (Debian slim base) was refused, then fixed by the agent from the gate's log and a reviewer's notes, and deployed (step 21). The agent's own supply chain came next (step 24): before it may load a skill, NVIDIA SkillSpector scans it on the build VM. A compromised look-alike scored 100/100 and was blocked (a hidden prompt injection, `curl | bash`, base64-encoded code); a vetted skill carrying the step-21 review notes scored 0, was installed as the exact bytes scanned, and with it the agent's fix passed the gate on its first run. Details: `ci/README.md`, `ci/agent-runs/README.md` and `ci/skills/README.md`.

**Code fixes, tested on D and E side by side** (the three issues no scanner reports, F1, F2 and F8; step 37):

| Test | Image D: the app as delivered, modules updated | Image E: the app fixed |
|---|---|---|
| Startup and request log | `[GIN-debug]` warnings: debug mode, trusting all proxies | Request lines only (`GIN_MODE=release`) |
| Request with a forged `X-Forwarded-For: 203.0.113.9` | Logged as the client: 203.0.113.9 | Logged from the real source, 172.17.0.1 (`SetTrustedProxies(nil)`) |
| Connection that sends half a request header and stops | Still open after 10 s (no timeouts; at step 13, the original binary was still open after 15 s) | Closed after 5 s (`ReadHeaderTimeout`) |

## 5. Change log
*(Steps 07–14 and 37: each change from A to E, the CVEs it removed, and the evidence.)*

- **A (baseline), step 07:** single-stage on `golang:1.18` (Go 1.18.10, Debian 11, built 2023-01-11). It ships the whole build environment (201 packages, gcc, git, curl, ssh, the Go toolchain, module sources, our source, the build cache) and runs as root. CVEs: step 09.
- **A → B (multi-stage), step 08:** the same build stage (cached), but only the static binary ships, on `debian:trixie-slim` (Debian 13, built 2026-11-04), as `USER 65532`. 1.49 GB → 155 MB on disk, 374 → 35.4 MB compressed; 201 → 78 packages; 8 of 10 tools gone (left: apt-get, perl); no source, toolchain or caches. Unchanged: the binary (Go 1.18.10, Gin 1.8.1). New: group 0 (F12); a shell and package manager remain (F13). CVEs: 734 → 161 (Grype), all of the drop in layers 1 and 2.
- **B → C (Chainguard runtime base), step 11:** one instruction changed, the runtime `FROM`, now `cgr.dev/chainguard/static` pinned by digest (`fc42af33…`) after verifying Chainguard's signature. 155 → 19 MB on disk, 35.4 → 5.62 MB compressed; 78 Debian packages → 3 Wolfi packages; no shell; runs as 65532:65532. CVEs: 161 → **69**: every OS CVE gone (92 → 0); the 60 standard-library and 17 module CVEs unchanged, because the binary is byte for byte the same (SHA-256 `ec6fa6de…`).
- **Measurement, step 12 (not an image): the compiler alone.** The untouched code built and ran with Go 1.27.4 (same `go.mod`, same 15 modules). On that binary, Grype: 69 → **16** (standard library 60 → 0; modules 17 → 16); govulncheck reachable: 62 → **11**, all in `x/net`. The compiler upgrade is cheap; the rest needs the dependency update.
- **C → D (current Go, updated modules), steps 13 and 37:** `go get -u ./...` and `go mod tidy` (Gin v1.8.1 → v1.12.0, `x/net` 2021 snapshot → v0.62.0; `go.mod` 19 → 30 modules; the `go` line 1.18 → 1.26.10); nothing broke. Builder: `cgr.dev/chainguard/go` (Go 1.27.4), pinned by digest (`64c93a14…`) and signature-verified, with `GOTOOLCHAIN=local`; runtime base unchanged from C. `main.go` is the original. CVEs: 69 → **0** (Grype, Trivy and govulncheck). Size: 19 → 34.9 MB on disk (5.62 → 11 MB compressed), because the binary nearly doubled: the update compiled in 19 modules instead of 15, including an HTTP/3 stack and MongoDB's BSON library that Gin now imports and this app doesn't use (F21). The dependency update was made at step 13 together with the code fixes; D was built on its own at step 37.
- **D → E (the app's own code and settings), step 13:** `main.go`: no trusted proxies, and an `http.Server` with timeouts; `GIN_MODE=release` in the Dockerfile. The same `go.mod`, builder and runtime as D. CVEs: 0 → **0**: the scanners can't tell D from E (step 37); the code-fix tests can.
- **Experiment, step 13: does the builder's brand matter?** The same build on Docker's `golang:latest` (also Go 1.27.4) gives the same result: 0 findings, and the same Go version, modules and build settings, except one build-info line that Chainguard's Go adds naming its own package. The difference is in the build environment: `golang:latest` has 325 CVEs (10 Critical), one of them on CISA's KEV list (CVE-2026-123158, `openssh-client`, which Debian rates Negligible), 208 Debian packages and curl, wget, apt-get, perl and python3; `chainguard/go` has 0 CVEs and 66 Wolfi packages (F22).
- **Step 14, the same-day rescan:** the four images built by then (A, B, C, and E, then called D) rescanned within a minute (13:46 UTC) on unchanged databases; every count reproduced (734, 161, 69, 0), and every image answered "Hello World!". E's 1,254 files contain no shell, BusyBox or package manager.
- **Step 37, image D:** built from `go-updated/` (E's `go.mod` and `go.sum`, the original `main.go`) and scanned against the same databases: 0 in Grype, Trivy and govulncheck, and the same 25 SBOM packages as E. Unsigned, so the cluster refuses it.
- **Experiment, step 28: Chainguard's base against Google's distroless.** Image C rebuilt with `gcr.io/distroless/static-debian13:nonroot` (pinned by digest, Google's keyless signature verified) as the only change, scanned with the same databases as the rescan. A tie on vulnerabilities: 0 OS CVEs in both, and the same 69 (Grype) and 157 (Trivy) in the same binary. Distroless: 6 Debian packages and 21.6 MB, against 3 Wolfi packages and 19 MB; both run as 65532:65532 with no shell, and both are signed. The difference is the evidence attached to the base: Chainguard's carries an SBOM, SLSA provenance and its build configuration, that distroless digest an SBOM only, and its recorded build date is 1970-01-01, fixed for reproducible builds. `reports/distroless/comparison.md`.

## 6. Top findings
*(Step 10, updated at step 13.)* Ranked by KEV, then vulnerable code in the shipped binary, then EPSS (scored 2026-11-15), then CVSS. Images A and B.

| CVE | Package | Layer | CVSS | EPSS | KEV | Reachable | Fixed in | Action |
|---|---|---|---|---|---|---|---|---|
| CVE-2023-44487 (HTTP/2 Rapid Reset) | `golang.org/x/net` 2021-02 snapshot; in A also the Go toolchain and Debian's `libnghttp2` | 4 (A: also 1, 2) | 6.9 (advisory) | 0.99999 (p99) | **yes** | Go files it as CVE-2023-39325: in the binary, and called. Not exposed today: the server speaks HTTP/1.1 only | `x/net` 0.17.0; Go 1.20.10/1.21.3 | Image D |
| CVE-2023-45288 (HTTP/2 CONTINUATION flood) | `golang.org/x/net` | 4 | 7.5 | 0.8946 (p99) | no | In the binary, and called. Not exposed today | `x/net` 0.23.0; Go 1.21.9/1.22.2 | Image D |
| CVE-2023-4911 (glibc "Looney Tunables") | `libc-bin` 2.31-13+deb11u5 (A only) | 1 | 7.8 | 0.6377 (p99) | **yes** | OS library (local privilege escalation) | 2.31-13+deb11u7 | **Fixed in B** (Debian 13) |
| CVE-2025-48384 (Git) | `git` 1:2.30.2-1 (A only) | 2 | 8.0 | 0.0448 | **yes** | Build tool shipped in A | 1:2.30.2-1+deb11u5 | **Fixed in B** (no git) |
| CVE-2023-24538 (html/template) | Go 1.18.10 standard library | 3 | 9.8 | 0.0228 | no | In the binary | Go 1.19.8/1.20.3 | Image D |
| CVE-2023-24540 (html/template) | Go 1.18.10 standard library | 3 | 9.8 | 0.0156 | no | In the binary | Go 1.19.9/1.20.4 | Image D |
| CVE-2022-41717 (HTTP/2 memory) | `golang.org/x/net` | 4 | 5.3 | 0.062 | no | In the binary, and called. Not exposed today | `x/net` 0.4.0 | Image D |

All the remaining top risks in B are inside the Go binary (layers 3 and 4); image D addresses them. Full rankings: `logs/10-triage.log`.

**Status in images D and E (steps 13 and 37):** none of these remain. Their binaries are built with Go 1.27.4 and `golang.org/x/net` v0.62.0, and Grype, Trivy and govulncheck find nothing in either. One KEV-listed CVE turned up in a **build environment** instead: Docker's `golang:latest` builder carries CVE-2026-123158 in `openssh-client` (added to KEV on 2026-11-09; NVD High, CVSS 8.1; Debian Negligible, not fixed). It doesn't ship in any image, and the builder of D and E, `chainguard/go`, doesn't have it (F22).

## 7. What's left
*(Step 14: each remaining finding, with its reason or VEX statement.)*

Images D and E have no known vulnerabilities, so nothing needs a VEX statement. The one triage judgment in the lab, HTTP/2 flaws present in the binary and called but not exposed (journal, surprise 19), applied to B and C; in D and E the dependencies are fixed. What remains is what a scan can't show:

| What's left | Why | What I'd do |
|---|---|---|
| **Zero is for today's databases** | New CVEs will be published against Go 1.27.4, Gin v1.12.0, `x/net` v0.62.0 and the three Wolfi packages | Rescan on a schedule, rebuild on new releases, and update the pinned digests automatically |
| **A wider dependency set** (F21) | Gin v1.12.0 compiles in an HTTP/3 stack, MongoDB's BSON library, a YAML parser and a MIME-type detector this app doesn't use: 19 modules instead of 15 | Accept, and keep them current; govulncheck will say whether a future CVE in them is reachable |
| **Problems in our own code and configuration** | Scanners check packages, not code. The three issues fixed in E (F1, F2, F8) came from reading the code and Gin's warnings; D shows them still there at zero CVEs | Static analysis in CI (`go vet` ran; gosec next) and code review |
| **The build environment** (F7, F22) | The lab's Docker daemon runs as root; builder stages run as root and download code; only the builder of D and E is minimal | Keep `chainguard/go` as the builder; build rootless or on isolated builders (optional step 14b) |
| **Supply-chain evidence** | SBOMs exist for every image (steps 15 and 37); C, D and E are in a registry (steps 16 and 37); E is signed with our key and carries a signed SBOM attestation, both verified (step 17, when E was called D), and D, never signed, is refused by the cluster. The Chainguard images they build on carry signed SLSA provenance, verified (step 22b). E runs on Kubernetes by that digest under the restricted Pod Security level (step 19). Still open: the signature isn't in a transparency log, so its time can't be checked; E's provenance is Docker's unsigned default, and its commit doesn't match the code built (F24); the cluster didn't check signatures at step 19 (F26), fixed at step 20 with a Kyverno policy | Keyless signing and provenance from a CI build of a clean checkout, logged |
| **The pipeline** (F27, F28) | The self-hosted runner runs each pull request with Docker, the cluster's admin credential and the signing key within reach; on a free private repo the gate's check can't block a merge | Ephemeral runners, keyless signing with the workflow identity, a deploy credential scoped to one namespace; a plan that enforces required checks |
| **The gate's blind spots** (F29) and **the agent's reach** (F30) | The gate hides build output, never starts the container, and accepts a named user and a `-dev` runtime; the agent ran under the user's account, limited only by tool allowlists | Show the build's error, run the image and call it, require a numeric user and the minimal runtime; give agents a sandbox without stored credentials |
| **The agent's skills** (F31) | A skill acts with the agent's permissions, and the agent loads any project skill, and by default every skill installed for the user, with no scan, signature or pin | Scan every skill before install and check the installed copy's hash (done here, step 24); run agents with project-only settings; take skills from a vetted, signed source such as Chainguard Agent Skills (beta) |
| **The lab's registry** (F25) | `registry:3` runs as root, serves plain HTTP with no authentication, and has 22 known CVEs | Fine for a single-user lab on a private network; in production, an access-controlled registry with TLS, or a managed one |
| **Debug containers** (F32) | Unsigned image C, refused as a pod, was admitted as a debug container in a running pod of E (`kubectl debug`, step 31): the signature policy matches pods on create and update, not the `pods/ephemeralcontainers` subresource | Extend the admission policy to debug containers, or limit who can add them with RBAC; debug with a signed, pinned image under the restricted profile (`tools/debug-e.sh`) |
| **Image labels** (F33) | D and E carry their base image's Author and 8 labels (title `static`, `created` 28 October): their Dockerfiles set none, and the build keeps the base's (step 33) | Set the OCI labels (title, source, revision, created) in the final stage, or in the CI build |
| **Module cooldown** (F34) | D's `go get -u` took `golang.org/x/crypto v0.59.0` at 5 days old; the 7-day rule applied to the tools and to hello-ai's packages didn't cover D's modules (step 36) | Hold module updates to versions at least 7 days old, or take them through Chainguard Libraries, whose cooldown does that |

## 8. Recommendations
*(Step 14, rewritten at step 22.)*

1. **Ship only what runs.** Multi-stage builds onto a minimal runtime: A → B cut 1.49 GB to 155 MB and 734 CVEs to 161 without touching the code.
2. **Start from a minimal, continuously rebuilt base.** Chainguard's `static` removed the OS layer (92 → 0), the shell and the package manager, and runs as 65532:65532 by default. Pin it by digest, verify its signature, and automate the digest updates so the pin doesn't go stale.
3. **Keep the toolchain and dependencies current.** The compiler alone removed every standard-library CVE (step 12); the `go.mod` update removed the rest. Update on a cadence, in small steps for a real service, with govulncheck in CI.
4. **Review the code, not just the packages.** Debug mode, trusting every proxy and missing server timeouts never show up in a CVE scan. Each fix here was tested with the attack it prevents.
5. **Triage by exploitation, not severity alone.** KEV first, then reachability (govulncheck), then EPSS, then severity. A KEV-listed OpenSSH CVE that Debian rates Negligible would have slipped through a severity filter (journal, surprise 25).
6. **Treat build images like production.** Their CVEs don't ship, but they run as root with network access: 325 CVEs in `golang:latest` against 0 in `chainguard/go`, for the same output.
7. **Read two scanners, and explain where they differ.** Grype matches Go vulnerabilities by function, Trivy by module version; both agree on D and E.

**Where Chainguard fits.** Images C, D and E: the runtime and builder images arrive with near-zero CVEs, signed, with SBOMs, rebuilt continuously, so the OS layer stops being the app team's problem. What stays with the app team is its code and its `go.mod`.

## 9. Appendix
- Every command, in order: `RUNBOOK.md`
- What happened at each step, including the surprises: `JOURNAL.md`
- Raw scan reports: `reports/before/`, `reports/after/`, `reports/final/`
- SBOMs: `sbom/`, SPDX 2.3 and CycloneDX for images A to E (Syft 1.57.1); Chainguard's signed SBOM for the `static` base (`chainguard-static-arm64.spdx.json`); and the three SBOMs shipped inside image E (`inside-image-d/`, extracted at step 15, when E was called D; D carries the same three, from the same base). Grype's scans of the SBOMs: `reports/sbom/`
- Provenance: Docker's default SLSA provenance for image E, as stored in the registry, and Chainguard's verified provenance for the `static` and `go` images it builds on (`reports/provenance/`)
- Signing: the public key `cosign.pub`, and the verification output, the signed SBOM statement and the registry objects for image E (`reports/signing/`)
- Command logs: `logs/`
