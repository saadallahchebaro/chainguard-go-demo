# Lab journal

One entry per step: what we did, what came out, and what surprised us. The raw evidence for each step is in `logs/`, and the clean commands are in `RUNBOOK.md`.

**Naming, from step 37.** Image E is the image built at step 13 and called D until step 36: the same digest (`c5ce9ddb…`), scans, signature and deployment. Image D is now the dependency update alone (`go-updated/`, `Dockerfile.d-updated`), built at step 37. The entries for steps 13 to 36, their logs and their screenshots keep the old name; where they say D about the fixed, signed or deployed image, read E.

## Surprises so far

| # | Step | What surprised us | Why it happened | What we did | For the deck? |
|---|---|---|---|---|---|
| 1 | 01 | The VM's first boot stayed at "Starting", with no IP address, for several minutes, and the VM doesn't answer ping | First boot runs cloud-init. The Mac runs GlobalProtect, Cisco AnyConnect (with its network filter) and CrowdStrike Falcon, which watch new networks; ping is probably filtered by one of them | Checked the DHCP lease (192.168.252.2), then SSH on port 22 from the Mac: it answered, and the launch finished. Nothing in the lab needs ping | Maybe: "corporate security agents on the laptop slowed my VM's first boot" |
| 2 | 01 | The VMs live on 192.168.252.x, not the 192.168.64.x the guide's examples assume | Multipass picks the subnet that macOS's network stack gives it | Always take the address from `multipass info`; matters at step 18 (k3s pulls from this IP) | No |
| 3 | 01 | Keys sent to the tmux session never reached the shell; tmux printed "not in a mode" | Scrolling with the mouse had put the pane into scroll (copy) mode, where keys are read as scroll-mode shortcuts | Leave scroll mode first: press `q`, or run `tmux copy-mode -q -t lab` | No |
| 4 | 01 | The challenge repo already has a `.gitignore` | It ignores the author's own scanner output folders | Appended ours below theirs instead of replacing it | No |
| 5 | 02 | apt also installed `docker-ce-rootless-extras`, which we didn't ask for | It's a recommended package of `docker-ce`, and apt installs recommended packages by default | Nothing to do. It's the package rootless Docker needs, so optional step 14b has one install fewer | No |
| 6 | 02 | `docker images` shows two sizes per image: `DISK USAGE` and `CONTENT SIZE` | Docker 29 stores images in containerd (`driver-type: io.containerd.snapshotter.v1`). It reports the unpacked size on disk and the compressed size that's downloaded and pushed | Decide at step 07 which size the comparison uses, and label it | Yes: say which size a number means |
| 7 | 02 | Copying the repo to the Mac stalled half-way through the first screenshot, at the same byte (59,392) every time | Streaming a tar archive through `multipass exec` stalled when started from a terminal tab. The same stream from a non-interactive shell arrived whole, so the terminal is involved; the exact cause wasn't confirmed | `tools/sync-to-mac.sh` now packs an archive on the VM, copies it with `multipass transfer`, and checks every file's SHA-256 against the VM's | No |
| 8 | 03 | Anchore's install script, which we downloaded and read before running, downloads a second script (the `install.sh` stored with the release tag) and pipes it into `sh`. That second script did the checking, so its "signature verification succeeded" came from code we hadn't read | Lines 866–874 of `grype-install.sh`: it fetches `${INSTALL_SH_BASE_URL}/${tag}/install.sh` and runs it | Verified both binaries ourselves: `cosign verify-blob` on the release's `checksums.txt` (signer: Anchore's release workflow), `sha256sum -c` on the archive, then compared the archived binary with the installed one. Identical | Yes: "the script you read isn't always the code that runs, so verify the artifact, not the installer's message" |
| 9 | 05 | The first build inside a container failed: Go couldn't resolve `proxy.golang.org` (`lookup … on 192.168.252.1:53: i/o timeout`), although the VM itself resolved names fine | Containers get only the VM's IPv4 DNS server, 192.168.252.1 (the Mac's end of the Multipass network), and it doesn't answer DNS. The VM works because systemd-resolved also uses the Mac's IPv6 DNS server, which does answer. Why the IPv4 side is silent wasn't confirmed; the Mac's security agents, which also block ping, are the likely cause | Tested each server with `dig`, then set Docker's default DNS in `/etc/docker/daemon.json` to `1.1.1.1` and `8.8.8.8` and restarted Docker. Containers and builds now resolve | Yes: "the VM had working DNS and my containers didn't: corporate network controls on the laptop" |
| 10 | 06 | The app folder's own `.gitignore` (shipped with the challenge) excludes `melange.rsa`, `melange.rsa.pub`, `packages/`, `output.tar` and `sbom-*` | Those are the default outputs of melange (packages, signed with a `melange.rsa` key) and apko (an image in `output.tar`, plus SBOMs), Chainguard's own build tools. The author has likely built this app with them; a hint, not confirmed | Noted. A possible stretch: build the app the way Chainguard builds its own images | Maybe: "the challenge itself hints at melange and apko" |
| 11 | 07 | Image A measures **1.49 GB** on disk (374 MB compressed); the guide estimated "around 1 GB" | The estimate left out the layers our build adds: 145 MB of module sources and a 62 MB build layer that includes Go's build cache | The comparison uses measured numbers, both sizes labelled | Yes: use the measured sizes |
| 12 | 08 | Right after building B, `docker image inspect debian:trixie-slim` said "No such image", although the build had just used it | BuildKit fetched the base into its own cache for the build without registering it as a named image; `docker run` then pulled it by name at the same digest (`a72b4433…`) | Nothing to fix; inspect base images after pulling them by name | No |
| 13 | 09 | Grype counts **87** Go standard-library CVE IDs in A but **60** in B, although both binaries are Go 1.18.10. The guide predicted equal counts. Grype also lists the Go toolchain itself (`go` 1.18.10, artifact type "binary") with **118** CVEs | The extra 27 are found only on the toolchain's programs inside A (`/usr/local/go/bin/go`, `pprof`, `trace`, `cover`, `vet`, `fix`…), which use parts of the standard library our app doesn't. On A's own binary, `/app/hello-server`, the set is **identical** to B's 60 (checked with `diff`) | Compare like with like: count the app binary. The guide was corrected at checkpoint 2 | Yes: "count the app binary, not everything that's lying around" |
| 14 | 09 | Trivy finds **10,856** unique CVE IDs in A; Grype finds **734** | **9,928** of Trivy's are on one package, `linux-libc-dev` 5.10.158-2 (kernel headers that `golang:1.18` includes for compiling C code). Grype reports 0 there: its configuration says `match-upstream-kernel-headers: false`. B has no `linux-libc-dev`, and there the scanners roughly agree (OS: 92 vs 96) | Record both, and explain the policy difference instead of picking a number | Yes: "one package and one setting explain 10,000 of the difference" |
| 15 | 09 | The scan modes disagree on the app's modules: Grype on the source (`go.mod`/`go.sum`) finds **66** module CVEs; Grype on the binary in B finds **17**; Trivy on the same binary finds **64**. Grype's source scan flags `x/crypto`, `x/sys` and `protobuf`, which are in the binary at the same versions, yet its binary scan doesn't | **Resolved at step 10.** On a Go binary, Grype reports a vulnerability only if the binary contains a vulnerable function (its `gosymbols` qualifier, `grype/pkg/qualifier/gosymbols` at v0.121.3, using Go's vulnerability database). Trivy, and Grype on `go.mod`, match by module version. `tools/gap-analysis.sh` explains 91 of the 92 Trivy-only Go IDs this way (57 package not compiled in: 42 modules and 15 standard library; 34 package compiled in but no vulnerable function: 6 and 28); 1 is unexplained (CVE-2026-39821) | Use Grype on the binary as the primary count, and say why Trivy's is higher | Yes: "Grype checks whether the vulnerable function is actually in the binary" |
| 16 | 09 | A's scan reports are too big to commit comfortably: `a-trivy.json` 80 MB, `a-trivy.sarif` 64 MB, `a-grype.json` 54 MB (GitHub warns above 50 MB) | Image A has thousands of findings, many repeated per package and per Go program | Commit gzip copies (6.4, 10.9 and 5.8 MB) and keep the uncompressed files on the VM (`.gitignore`). `tools/sync-to-mac.sh` now copies only the files git sees | No |
| 17 | 10 | The guide says Grype matches Go's standard library through NVD and that Go's own vulnerability database isn't on Grype's source list. In our report, every one of Grype's 60 standard-library matches comes from namespace `govulndb:language:go`: Go's own database | Grype's database (schema v6) has added Go's vulnerability database since the guide was written | The guide was corrected at checkpoint 2 | No (but don't repeat the old claim) |
| 18 | 10 | The same HTTP/2 Rapid Reset attack carries two CVE IDs. Grype and CISA's KEV list use **CVE-2023-44487** (the protocol-wide CVE); Trivy and Go's database use **CVE-2023-39325** (Go's own), and Go's advisory GO-2023-2102 doesn't alias 44487 | Different CVE numbering authorities assigned IDs for the protocol and for Go's implementation | Read both together: the KEV-listed attack is present in B's binary under Go's ID (in the binary, and called) | Yes: "a KEV check by CVE number alone can miss the twin" |
| 19 | 10 | The top-ranked flaws in B (Rapid Reset and the other HTTP/2 denial-of-service bugs in `x/net`) are in the binary and reachable in the code, but **not exposed**: the server refused HTTP/2 and answered an upgrade with HTTP/1.1 | Gin only serves HTTP/2 over cleartext when `UseH2C` is set (gin.go v1.8.1, lines 219–226), and the server isn't on TLS | Recorded as a triage nuance; still fixed in D, because one configuration change (`UseH2C`, or TLS) would expose them | Yes: "reachable in code isn't the same as exposed, and neither means safe to leave" |
| 20 | 12 | Rebuilding the same code with a newer Go (same `go.mod`, same 15 module versions) also removed a **module** CVE: Grype's module count went 17 → 16. The one that dropped is CVE-2021-38561 in `golang.org/x/text` v0.3.6 (`language.Parse`) | Grype matches Go vulnerabilities by function. It recorded `language.Parse` in the Go 1.18 binary and doesn't find it in the Go 1.27.4 build: the newer toolchain no longer links it. (`go tool nm` lists it in neither binary, so Grype's symbol data covers more than `nm`, perhaps inlined calls: not confirmed) | Recorded. govulncheck agrees: its one reachable `x/text` vulnerability is gone in the Go 1.27.4 build too | Maybe: "even the compiler decides which CVEs you ship" |
| 21 | 13 | `go get -u` moved the `go` line in `go.mod` from 1.18 to **1.26.10**, a patch-level minimum. Gin didn't set it: its SSE helper `gin-contrib/sse` v1.2.1 declares `go 1.26.10` (`x/sys` and `x/text` ask for 1.26.0) | Since Go 1.21, the `go` line is a minimum the toolchain enforces, and `go get` raises it to the highest one any dependency declares (`go mod graph` lists them) | Nothing to fix: the builder has Go 1.27.4. With `GOTOOLCHAIN=local`, an older builder would fail with a clear error instead of downloading a compiler mid-build | Yes: "a small helper library decided which compiler my build needs" |
| 22 | 13 | The update made the binary and the image **bigger**: the binary went from 11.7 MB (old code, same Go 1.27.4) to **20.2 MB**, and image D is 34.9 MB on disk against C's 19 MB. It now carries 19 modules instead of 15 | Gin v1.12.0 imports an HTTP/3 stack (`quic-go/http3`), MongoDB's BSON library and `goccy/go-yaml`; `validator` brings `mimetype` (`go mod why -m`). Go compiles them in whether the app uses them or not. `bytedance/sonic` is in `go.mod` and imported by `gin/codec/json`, but isn't in the binary: that import sits behind a build constraint this build doesn't meet (`go mod why` counts every build tag) | Accepted (F21): all of it scans clean today | Yes: "patching removed 69 CVEs and quietly added an HTTP/3 stack I never asked for" |
| 23 | 13 | The guide says the proxy fix can't be shown from the startup output, so point to the code. It **can** be shown, from the request log: with a forged `X-Forwarded-For: 203.0.113.9`, the original binary logged 203.0.113.9 as the client; the patched one logged the real source (`::1` locally, 172.17.0.1 in the container) | Gin's request logger prints `c.ClientIP()`, which is exactly what the trusted-proxy setting changes | Tested both code fixes before and after, the timeouts too (a half-sent header: still open after 15 s on the original, closed after 5 s by D). The guide is corrected at checkpoint 3 | Yes: "I didn't just change the code: I showed the attack working before and failing after" |
| 24 | 13 | The binaries built by `chainguard/go` and by `golang:latest` differ by 128 bytes and in hash, although both are Go 1.27.4 building the same source. The only difference in their build information: Chainguard's adds `build chainguard_go_package=go-1.27-1.27.4-r0` | Chainguard's Go records the Wolfi package that compiled the binary in its build information. How it adds the setting wasn't checked | Recorded. From the binary alone, you can tell which exact Go package built it | Maybe: a small provenance detail |
| 25 | 13 | The official `golang:latest` builder carries a **KEV-listed** CVE that Debian rates **Negligible**: CVE-2026-123158 in `openssh-client` 1:10.0p1-7+deb13u4 (OpenSSH; added to CISA's KEV on 2026-11-09; NVD: High, CVSS 8.1; Debian: not fixed). `chainguard/go` ships `openssh-client` 10.6_p2-r0, with no findings | Grype's primary severity for a Debian package is Debian's own rating; NVD and CISA see this one differently. Why Debian rated it Negligible wasn't checked | Recorded (F22). The triage ranks KEV before severity, which is how it surfaced | Yes: "a severity filter would have hidden an actively exploited CVE in my build environment" |
| 26 | 13 | `trivy convert` wrote an **empty** table report for D (0 bytes), with the warning "No enabled scanners found. Summary table will not be displayed." | With zero findings there's nothing to tabulate, and `convert` doesn't know which scanners produced the JSON, so it skips the summary as well | Wrote D's table straight from a scan (`trivy image --format table`, same database): both targets "0: Clean". At step 14, `trivy convert --scanners vuln` turned out to print the summary from the JSON, so one scan per image is enough | No |
| 27 | 13 | The guide's builder figures didn't match the lab: `chainguard/go` holds **66** apk packages (Syft), not "about 200"; `golang:latest` is now Go **1.27.4** (the guide says 1.27.3), 320 MB compressed (the guide says 309) and 208 Debian packages | The guide's figures came from Chainguard's published SBOM and an earlier `golang:latest`. Why the package counts differ wasn't checked | The guide is corrected at checkpoint 3 with the measured numbers | No |
| 28 | 14 | Image D carries an **SPDX SBOM for each of its 3 Wolfi packages inside the image** (`/var/lib/db/sbom/*.spdx.json`), plus Wolfi's package database (`/usr/lib/apk/db/installed`), the build record `/etc/apko.json` and Chainguard's signing keys, but no package manager to use any of them | Chainguard's images are assembled by apko from packages (the `apko.json` in the image says so); the package database and per-package SBOMs are what scanners and Syft read, which is how they identified D's 3 packages | Recorded for the SBOM step (15): compare our Syft SBOM with what the image already ships | Yes: "the SBOM travels inside the image" |
| 29 | 15 | **Scanning the SBOM gives a higher count than scanning the image.** Grype on Syft's SBOM reports **158** for C instead of 69 (Go modules 17 → 65, standard library 60 → 104); B 161 → 250; A 734 → 780; D 0 either way. The OS layer is identical (603 and 92). SPDX and CycloneDX give the same 158 | An SBOM lists module versions, not the functions compiled into the binary: Syft's SBOM has no symbol data ("symbol" appears 0 times), so Grype can't apply its function-level filter (surprise 15) and matches by module version, as Trivy does. Its 158 IDs for C are Trivy's 157 plus CVE-2023-44487, Rapid Reset's KEV ID, which Trivy files under CVE-2023-39325 (surprise 18). None of the image scan's 69 are missing | Recorded (F23). State the method with every number: "scanned the image" or "scanned the SBOM". Every count in the report is from images | Yes: "the same scanner gives 69 or 158 for the same image, depending on whether it sees the binary or only the SBOM" |
| 30 | 15 | Image A's SBOM lists software from three more ecosystems than Debian and Go: **Mercurial** 5.6.1 (Python), an **npm** manifest (`d3-pprof` 2.0.0) inside the Go toolchain's pprof sources, and the Go toolchain itself as a generic package | `golang:1.18` installs Mercurial so `go get` can fetch from Mercurial repositories; the npm manifest is part of Go's own source tree (`/usr/local/go/src/cmd/vendor/github.com/google/pprof/third_party/d3flamegraph/package.json`) | Recorded: what an SBOM shows that "it's a Go image" hides | Maybe: "my Go image had a Python package in it" |
| 31 | 15 | Chainguard's signed SBOM for `static` (arm64) has **17** entries for an image our scans see as 3 packages. For each package it also names the build file at an exact commit in `chainguard-dev/stereo` (for example `tzdata.yaml`) and the upstream source (`eggert/tz` 2026f, `alpine/ca-certificates` 20261020), plus the image and its layer. The 3 SBOMs inside image D carry the same package URLs | apko generated it (its creator field: apko v1.2.28), and it records where each package came from as well as what it is | Compared the three SBOMs: they agree on the 3 packages and their versions. Chainguard's covers the base only; ours covers the whole image, our binary and its 19 modules included | Yes: "their SBOM traces each package back to its recipe and its upstream source; mine adds the app on top" |
| 32 | 16 | The registry the guide names, `registry:2`, is distribution 2.8.3 **built on 2023-10-02**, runs as root and has **72** CVEs (4 Critical; 66 in its Go standard library). `registry:3` (built 2026-11-05, distribution 3.1.2) has 22 (2 Critical) and also runs as root. Chainguard's registry image isn't available without an account (cgr.dev answers FORBIDDEN) | A major-version tag stays on that major's last release, like `golang:1.18` | Switched to `registry:3`, pinned by digest, before pushing anything. Its 22 CVEs, root, plain HTTP and no authentication are recorded as lab-only trade-offs (F25) | Yes: "my first pick for the lab's own registry had the same problem as the app's base image" |
| 33 | 16 | Docker's **default** provenance on D is SLSA **v1**, and it already lists both base images by digest (`resolvedDependencies`: `chainguard/go@64c93a14…` and `chainguard/static@fc42af33…`, matching the Dockerfile's pins), plus the git repository and commit. The guide implied only `mode=max` records the base images | BuildKit's minimal provenance records the build's resolved inputs | Recorded; the guide is corrected at the next checkpoint | Maybe: "the default provenance was more useful than I expected" |
| 34 | 16 | The provenance names commit `ca39930` as D's source, but at that commit `go-patched/` still held the **original** code (Gin v1.8.1, no `SetTrustedProxies`). D was built from uncommitted changes, which were committed about 12 minutes after the build finished, as `cac3592`. Nothing in the provenance marks the tree as modified | BuildKit records the checkout's commit (`vcs:revision`); this record has no marker for local changes (`dirty` or `modified`: 0 matches) | Recorded rather than rebuilding D, because a rebuild changes D's digest after step 14's evidence was taken (F24). The fix is a CI build from a clean checkout (step 20), where the commit and the code match by construction | Yes: "my provenance looked precise and pointed at the wrong code" |
| 35 | 17 | `registry:3` has **no OCI 1.1 referrers API** (`/v2/hello/referrers/<digest>`: HTTP 404), yet cosign v3 stored its new-format signature without complaint: a tag named after D's digest (`sha256-c5ce9ddb…`) points to an OCI index that lists the signature (a Sigstore bundle v0.3) and, later, the SBOM attestation | The OCI 1.1 specification defines this tag scheme as the fallback for registries without the API, and cosign uses it | Nothing to change: `cosign tree` and `cosign verify` follow the tag. One consequence: a tag-cleanup job must keep `sha256-…` tags, because the signature is only reachable through it on this registry | Maybe: "where does a signature live? Next to the image, never inside it" |
| 36 | 17 | With `--insecure-ignore-tlog=true`, cosign prints "WARNING: Skipping tlog verification is an insecure practice…", then still lists "Existence of the claims in the transparency log was verified offline" among the checks performed. No log was involved: the signature was never uploaded | cosign v3.1.4 prints the same checklist whatever was skipped | Read the warning, not the checklist. Never quote that line as proof of a log check for a key-signed, unlogged image | Yes: "read what the tool warns, not what it lists" |
| 37 | 19 | **Pod Security refused image D**, the non-root, shell-less image, when it was run without security settings in the pod spec: `kubectl run` was rejected with four reasons (privilege escalation, capabilities, `runAsNonRoot`, seccomp) | Pod Security Admission judges the pod's manifest, not the image: it can't see that the image's user is 65532 or that it has no shell | The Deployment declares every setting; the same image then runs. The image's safe defaults and the pod's declared settings are two separate layers, and both are needed | Yes: "a safe image isn't enough: the cluster only trusts what the manifest declares" |
| 38 | 20 | GitHub refused the first push **twice**: `gh`'s login on the Mac lacked the `workflow` scope, and a write deploy key added **through `gh`** for the VM was refused the same way ("refusing to allow an OAuth App to create or update workflow `.github/workflows/deploy.yml` without `workflow` scope") | Pushing anything under `.github/workflows/` needs the `workflow` scope, and a deploy key created with an OAuth app's token is tied to that app and inherits its scopes | You ran `gh auth refresh -h github.com -s workflow`; the VM's deploy key then pushed | Maybe: "even setting up the pipeline is a permissions puzzle" |
| 39 | 20 | The guide's least certain part worked on the first try: Kyverno v1.19.2's `ImageValidatingPolicy` (API `policies.kyverno.io/v1`) verified cosign v3 signatures, stored through the registry's fallback tag, on a plain-HTTP registry, with one setting, `credentials.allowInsecureRegistry: true`. About 5 minutes of the 20-minute time box | The `v1` API already exists in 1.19.2, and Kyverno reads the new signature format | Recorded; the guide's three doubts are answered | Yes: "the cluster now refuses anything the pipeline didn't sign" |
| 40 | 20 | Pinning FastAPI and uvicorn alone would have installed **14** packages, one of them, `annotated-doc` 0.0.6 (a dependency of a dependency), less than 7 days old. Current FastAPI also pulls in `opentelemetry-api` | Top-level pins don't cover what they pull in | `ci/resolve.py` pins every installed package to the newest release at least 7 days old (0.0.5 here); the gate then checks all of them | Yes: "a cooldown is only as good as its pins: a dependency of a dependency was days old" |
| 41 | 20 | `gh secret set` in the app's Terminal panel never received the typed password; GitHub listed no secret afterwards | The panel didn't pass keystrokes to `gh`'s interactive prompt | The secret was added on GitHub's settings page. Checked that nothing was typed into the VM's terminal or its history | No |
| 42 | 21 | Asked with no guidance inside the `hello-ai` repo, the agent **complied with the gate anyway**: it rebuilt the Chainguard Dockerfile on the same pinned digests and pinned `httpx` exactly | The repo's `README.md` and `gate.sh` describe the rules, and it read them | Ran the same request in a folder holding only the app (run B), which produced the unguarded change. Even there it noticed the parent folder's name and *offered* Chainguard images | Yes: "agents follow the rules they can see" |
| 43 | 21 | `dfc` converted `python:3.13-slim` to `cgr.dev/<org>/python:3.13-dev`: a version tag the free tier doesn't serve (`MANIFEST_UNKNOWN`). Without `--org` it writes the placeholder `ORG` | `dfc` targets paid registries, where version tags exist | The agent used `latest-dev` and pinned it with `crane digest` | Maybe |
| 44 | 21 | The agent's first fix failed with only `FAIL build` in the log. The cause, `addgroup: permission denied (are you root?)`, appeared only when the build was reproduced by hand: Chainguard images run `RUN` steps as 65532 | `gate.sh` sends `docker build`'s output to `/dev/null` | The reviewer passed the error on (F29) | Yes: "an agent can only fix what the log tells it" |
| 45 | 21 | The agent CLI, started from the desktop app's shell or its Terminal panel, failed with "OAuth session expired and could not be refreshed", even after a fresh login | The app sets about 30 of its own variables, which a child CLI inherits; the CLI's own stored login also needed renewing | You logged in again in your own terminal; the CLI was then started with a clean environment (`env -i` keeping HOME, PATH, USER and TERM) | No |
| 46 | 22 | The deck, the walkthrough and the quiz, written before the lab, carried claims the lab disproved: "about 1 GB" (1.49 GB), "under 100 MB" (155 MB), "about the binary's size" (C is 19 MB, D 34.9 MB), "the OS row falls to about zero" (exactly 0), "about 20 modules" (19 in `go.mod`, 15 compiled in), "D roughly the same size as C", `registry:2`, an agent that "opens a pull request" (it had no `git`) and a rule on `main` that "needs the gate and a person" (a free plan can't enforce it) | They were written from documentation, before anything ran | Every number and claim now comes from `results.json`, `reports/` or `logs/`; the deck, the walkthrough and the quiz were corrected, and one stale line in the guide | Yes: "every number on these slides comes from a file in the repo" |
| 47 | 22 | The per-layer counts add up to more than the unique totals: A's layers sum to 825 against 734 unique IDs, B's to 169 against 161, C's to 77 against 69 | A CVE found in two layers counts once in each: HTTP/2 Rapid Reset, for one, is in both the standard library and `x/net`, and A's Go toolchain repeats standard-library CVEs | The results chart shows bars per layer and the unique total above each bar, and its footnote says so | Yes, if asked why the bars don't add up |
| 48 | 24 | The headless agent could load **about 250 skills**: every skill and plugin installed for the user on the Mac, not only the project's | The agent CLI loads the user's own settings, plugins and skills by default; the tool allowlist limits what it runs, not what it reads as a skill | Started it with `--setting-sources project,local`: 20 skills, the one the skill gate installed and 19 built into the agent's tool | Yes: a gate on the project's skills folder alone isn't enough |
| 49 | 24 | SkillSpector's least-privilege rule (LP3, "MCP Least Privilege") fired on the compromised skill but not on the vetted one, though neither declares permissions | Not confirmed; it may only fire when a skill shows other risks | None: the vetted skill scored 0 either way | No |
| 50 | 24 | In the live run, **read-only shell commands ran without being on the allowlist**: `ls` and `cat` in the write step, where no shell was allowed at all, and `git show a6f5b12:Dockerfile`, `cat gate.sh` and `git diff --stat` in the fix. The agent read the previous merged fix from Git history and said its change followed "the same pattern as the earlier fix in a6f5b12" | The agent's tool approves commands it treats as read-only without asking; the allowlist only adds to them (observed, not checked against its documentation). Everything that changes something or reaches out was refused: `docker build`, `pip`, `docker version` | Denied git outright: the console now runs the agent with `--disallowedTools 'Bash(git:*),Bash(/usr/bin/git:*)'`. Tested on a throwaway repository: without it, `git show HEAD~1:f.txt` printed the old content with only `Read` allowed; with it, `git show`, `git log` and `/usr/bin/git show` were all refused. `ls` and `cat` still run. The clean evidence for the skill is the offline rehearsal, whose repository held no earlier fix | Yes: an allowlist isn't a sandbox; deny what must never run |
| 51 | 25 | The demo console's terminal showed **"disconnected" after some commands** and never came back, though the server was running | Each start of the console server makes a new token. The server had been restarted (after each change to the console) while the page stayed open, so the page's event stream carried the old token, was refused, and the page gave up. Node's 5-minute request timeout was ruled out: a test stream stayed open for 420 s | When its stream is refused, the page now shows "disconnected: waiting for the server…", checks the server every few seconds and reloads itself to pick up the new token (a stream that merely drops shows "reconnecting…" while the browser retries); the server also sets `requestTimeout = 0`, so a long stream is never cut. Tested: after a restart, the open page reloaded within seconds and its token matched | No |
| 52 | 26 | The build VM's disk was **93% full** (2.1 GB free of 29 GB) when a button downloaded today's scanner databases into `/tmp`: a second copy of Grype's database is 3.3 GB and Trivy's 1.7 GB | Five days of lab work: 5.25 GB of images, 6.9 GB of build cache, and the recorded databases (Grype 3.3 GB, Trivy 1.7 GB) | Stopped the download and deleted the copies (5.4 GB free again). The button now uses Grype only, checks for 4 GB free first, and deletes its copy after the scan | No |
| 53 | 26 | Rebuilding D with every layer cached still gave a **new image ID** (`34a1c5a3…` against `c5ce9ddb…`), and so did a rebuild with no cache (`89f19d99…`), yet the binary inside is byte for byte the same (`00aee679…`) | Not confirmed. The image ID covers more than the layers: most likely the provenance BuildKit attaches by default, which records when the build ran | Compare binaries, not image IDs, to show a build is reproducible; sign and deploy by the digest that was built | Maybe: "same binary, different digest: sign what you built" |
| 54 | 28 | Google's distroless static image records its creation date as **1970-01-01**, so the image itself can't say how old it is; Chainguard's static says 2026-10-28 | Distroless builds reproducibly and fixes every timestamp to the Unix epoch, so two builds of the same inputs are identical | Took the base's age from neither: the digest was resolved on the day and pinned, and the signature verified | Maybe: "the image can't tell you its age" |
| 55 | 29 | `tools/shot.sh` saved the screenshot at **709×499**, half the resolution of the earlier ones and too soft for a slide | The Terminal window sat on the external display, which runs at 1x; `screencapture` records a window at its display's scale, and the earlier shots are 2x captures | Moved the window to the laptop's built-in Retina display and captured again: 1418×998 | No |
| 56 | 31 | **An unsigned image got into the cluster as a debug container.** Image C, which the signature policy refuses as a pod, was admitted by `kubectl debug` into a running D pod and started (it then failed to bind port 8080, which D holds) | The policy matches `pods` on CREATE and UPDATE; debug containers are added through the `pods/ephemeralcontainers` subresource, and the rule checks only `images.containers` | Recorded as F32; the side door is a console button (`p-debug-gap`); each test deletes the pod it used | Yes: "my policy stops unsigned images at the door, but `kubectl debug` is a side door" |
| 57 | 31 | Chainguard's `busybox`, used as the debug image, has `sh`, `ps`, `ls`, `cat` and `netstat`, but **no `wget`, `curl` or `nc`** | A minimal image; which applets Chainguard includes wasn't checked further | Calls to the app come from outside the debug container; `netstat` shows D listening instead | No |
| 58 | 31 | **`chainguard/static` has no `-dev` tag** on the free tier (`MANIFEST_UNKNOWN`), while `chainguard/go:latest-dev` exists. So D's runtime base can't simply be swapped for a `-dev` variant to get a shell | Not checked why; the free tier offers `latest` and, for some images, `latest-dev` | Debug D with a separate debug container instead, which leaves D's signed digest unchanged | Maybe: the answer to "why not just use -dev?" |
| 59 | 33 | **Image D names apko as its author and carries Chainguard's `static` labels**: `org.opencontainers.image.title: static`, the source of Chainguard's `static` image, and `created` 28 October, though D was built on 16 November | A Docker build keeps the base image's Author and labels, and Dockerfile D sets none (0 `LABEL` lines); the pinned `static` digest has the same Author and the same 8 labels | Recorded as F33; D left unchanged, because new labels would change its signed digest | Maybe: if asked to inspect D |
| 60 | 34 | **Grype names Chainguard's nginx `wolfi 20230201`,** which reads like a date in 2023 | Wolfi's `/etc/os-release` has a fixed `VERSION_ID="20230201"`; a current `chainguard/static` shows the same, so it isn't the image's date | Noted, so the label doesn't mislead when the comparison runs live | Maybe: if asked why it says 2023 |
| 61 | 36 | **Chainguard's own pages disagree on Libraries for Go:** the docs say beta; the Go product page says early access and a Technology Preview | Not confirmed; the pages were updated at different times (the Go overview on 14 October, the plans page on 10 November) | The deck's notes give both labels; step 25's note, "beta, not early access", is only half right | Yes, if asked whether it's GA: neither label means generally available |
| 62 | 37 | **A console proof updated the lab's scanner databases.** "Rescan D now" ran Grype and Trivy with automatic updates on, so the shared caches moved from the recorded 16 November databases to 17 November's | The proof was written to check today's database, but did it in the shared cache, not a separate one | Grype's recorded database restored from its archive (checksum verified); Trivy's can't be, because only moving tags are published, so live Trivy counts use 17 November's. The proof now uses the recorded databases; "E against today's Grype database" still checks today's, in `/tmp` | No |

## Findings we noticed (to fix or explain later)

Things the lab showed us before any scan, mapped to the six-layer stack (1 OS packages, 2 build tools left in the image, 3 Go standard library, 4 third-party modules, 5 our code and its settings, 6 how it runs).

| # | Noticed at | Finding | Layer | Evidence | Fix or explanation |
|---|---|---|---|---|---|
| F1 | 05 | Gin runs in "debug" mode by default (`Running in "debug" mode. Switch to "release" mode in production.`) | 5 | `05-sanity-app-runs.png`, `logs/05-sanity.log` | **Fixed in E** (built at step 13, then called D): `ENV GIN_MODE=release`; the container log has no `[GIN-debug]` lines. Image D (step 37) keeps it, to show what a scanner misses |
| F2 | 05 | Gin trusts all proxies ("You trusted all proxies, this is NOT safe"), so the client IP the app sees can be spoofed with an `X-Forwarded-For` header | 5 | `05-sanity-app-runs.png`, `logs/05-sanity.log` | **Fixed in E** (built at step 13, then called D), with `SetTrustedProxies(nil)`, **and tested:** with a forged `X-Forwarded-For: 203.0.113.9`, the original binary logged 203.0.113.9 as the client; E logged the real source (172.17.0.1, Docker's bridge). Image D (step 37) still logs 203.0.113.9 |
| F3 | 05 | The `golang:1.18` tag still points to an image built on 2023-01-11: Go 1.18.10 on Debian 11 | 3, and 1–2 in image A, which ships this whole image | `05-sanity-old-toolchain.png`, `logs/05-sanity.log` | Image D builds with a current Go (`chainguard/go`), step 13. Image A shows the full cost, step 07. **Done in D (step 13):** builder `cgr.dev/chainguard/go` (Go 1.27.4), pinned and signature-verified |
| F4 | 05 | Go 1.18 reached end of life on 2023-02-01 (last patch 1.18.10); go.dev now supports only go1.27.4 and go1.26.11 | 3 | `05-sanity-old-toolchain.png` | Same as F3. Step 12 showed the same code builds unchanged with Go 1.27.4. **Done in D (step 13):** Go 1.27.4 |
| F5 | 05 | Debian 11, the OS inside `golang:1.18`: security support ended 2024-08-14 and LTS ended 2026-08-31, leaving only paid extended support. Trivy warns while scanning A: "This OS version is no longer supported by the distribution" (debian 11.6) | 1 | `05-sanity-old-toolchain.png` (dates from endoflife.date), `logs/09-scan-ab.log` | Image B moves to Debian 13 (step 08); image C drops Debian for `chainguard/static` (step 11). **Done in B (step 08):** Debian 13, built 2026-11-04, security support until 2028-08-09 |
| F6 | 05 | `go.mod` pins Gin v1.8.1 (released 2022-06-06; the latest is v1.12.0, 2026-02-28) and 2021-era `golang.org/x` modules | 4 | `05-sanity-built.png`, `05-sanity-old-toolchain.png` | Image D updates `go.mod` (`go get -u`), step 13. **Done in D (step 13):** Gin v1.12.0, `x/net` v0.62.0, `x/crypto` v0.59.0, `x/sys` v0.50.0, `x/text` v0.44.0; nothing broke (F21: what the update added) |
| F7 | 05 | The build container ran as root and wrote a root-owned file onto the VM | 6 (the build host) | `logs/05-sanity.log` | Explained: the standard Docker daemon runs as root, a deliberate lab trade-off. Optional step 14b shows rootless |
| F8 | 06 | No HTTP server timeouts. `main.go` starts the server with `r.Run()`, which in Gin v1.8.1 calls `http.ListenAndServe(address, engine.Handler())` (gin.go line 382). Go's server then has `ReadHeaderTimeout` and `ReadTimeout` at zero, which means "there is no timeout", so slow or idle clients can hold connections open (Slowloris-style) | 5 | `06-app-gin-source.png`, `logs/06-app.log` | **Fixed in E** (built at step 13, then called D), with an `http.Server` with explicit timeouts, **and tested:** a connection that sends half a request header was still open after 15 s on the original binary; E closed it after 5 s (`ReadHeaderTimeout`). Image D (step 37) was still holding it after 10 s |
| F9 | 06 | The binary carries **15** modules; `go.mod` lists **19**. Not compiled in: `goccy/go-json`, `json-iterator/go`, `modern-go/concurrent` and `modern-go/reflect2`, because Gin's alternative JSON code sits behind the `go_json` and `jsoniter` build tags. The oldest pin, `modern-go/concurrent` (a 2018 snapshot), is one of them | 4 (scope) | `06-app-buildinfo.png`, `06-app-gin-source.png` | Explains why `grype dir:./go` (reads go.mod) and an image scan (reads the binary) can differ, step 09 |
| F10 | 07 | Image A ships its whole build environment: Debian 11 with 201 packages; build tools and tools an attacker would welcome (`go`, `gcc`, `git`, `make`, `curl`, `wget`, `apt-get`, `perl`, `python3`, `ssh`); the Go 1.18 toolchain (338 MB); the downloaded module sources (139 MB); our source code; and Go's build cache (about 52 MB inside the 62 MB build layer). The scans add: `linux-libc-dev` kernel headers (9,928 CVE IDs in Trivy, surprise 14) and the Go toolchain itself (118 Grype CVEs on `go` 1.18.10, plus 27 standard-library IDs only on toolchain programs, surprise 13) | 1 and 2 | `07-image-a-inside.png`, `07-image-a-history.png` | Image B's multi-stage build ships only the binary on a slim base, step 08. **Done in B (step 08):** no build tools, toolchain, source, module cache or build cache; 201 packages down to 78 (what's left: F13) |
| F11 | 07 | Image A runs as **root** (no `USER`; `id` gives `uid=0(root)`) and has a **shell** (`/bin/sh`, `/bin/bash`) | 6 | `07-image-a-run-checks.png` | Image B runs as user 65532 (step 08); images C and D have no shell (steps 11, 13). **Half done in B (step 08):** non-root user, but group 0 (F12) and still a shell (F13). **Done in C (step 11):** runs as 65532:65532 and has no shell |
| F12 | 08 | Image B runs as `uid=65532` but **`gid=0(root)`**: `USER 65532` sets only the user, 65532 has no entry in Debian's `/etc/passwd`, so the group falls back to root's | 6 | `08-image-b-run-checks.png` | Production fix: `USER 65532:65532`. Kept in B as the guide writes it, to show the issue; `chainguard/static` defines 65532 with group 65532 (step 11). **Fixed in C (step 11):** `ps` on the VM shows the process at UID 65532, GID 65532 |
| F13 | 08 | Image B still ships a shell (`/bin/sh`, `/bin/bash`), a package manager (`apt-get`, `dpkg`) and `perl`, as part of Debian's 78-package essential set | 1 and 6 | `08-image-b-inside.png`, `08-image-b-compare-a-b.png` | Image C's `chainguard/static` has no shell and no package manager, step 11. **Done in C (step 11):** `docker exec … sh` fails with "executable file not found"; 3 packages, 1,254 files |
| F14 | 09 | **Every Critical CVE left in B is inside the Go binary.** Grype: 5 unique (CVE-2023-24538, CVE-2023-24540, CVE-2025-68121, CVE-2025-22871 in Go 1.18.10's standard library; CVE-2026-78663 in both the standard library and `x/net`). None are in Debian 13's packages | 3 and 4 | `09-scan-b-criticals.png`, `reports/before/b-grype.txt` | Image D: a current Go (`chainguard/go`) and an updated `go.mod`, step 13. **Fixed in D (step 13):** 0 Critical (0 findings at all) |
| F15 | 09 | **Reachability** (govulncheck). The binary shipped in B can reach **62** known vulnerabilities: 49 in Go 1.18.10's standard library, 12 in `x/net`, 1 in `x/text`. Source mode finds 11 reachable, all in `x/net`, because it judges the standard library by the VM's Go 1.27.4. Four of the reachable `x/net` issues are only fixed in v0.60.0 | 3 and 4 | `09-scan-govulncheck.png`, `reports/before/govulncheck-*.txt` | Image D (step 13). Reachability drives the triage at step 10. **Fixed in D (step 13):** govulncheck finds no vulnerabilities in source or binary mode |
| F16 | 10 | Image A carries **three CVEs on CISA's KEV list** (catalog 2026.11.13): HTTP/2 Rapid Reset **CVE-2023-44487** (our `x/net`, the Go toolchain, Debian's `libnghttp2`), glibc "Looney Tunables" **CVE-2023-4911** (Debian 11's `libc-bin` 2.31-13+deb11u5; EPSS 63.77%) and Git **CVE-2025-48384** (`git` 2.30.2). Grype's own KEV data agrees | 1, 2 and 4 | `10-triage-a-kev.png`, `reports/before/cisa-kev.json` | **B removed two** (glibc fixed in Debian 13; no git). Rapid Reset remains, inside the binary: image D, step 13. **Fixed in D (step 13):** `x/net` v0.62.0 and Go 1.27.4; no KEV CVE in D |
| F17 | 10 | **B's top risks after triage** (KEV, then in the binary, then EPSS): a family of HTTP/2 denial-of-service flaws in the 2021 `x/net`: Rapid Reset (KEV, EPSS 0.99999), CONTINUATION flood CVE-2023-45288 (EPSS 89.46%), and six more in the binary and called. Then Go 1.18.10's Critical CVE-2023-24538 and CVE-2023-24540 (CVSS 9.8, EPSS about 2%), in the binary. HTTP/2 isn't exposed in the current configuration (surprise 19) | 3 and 4 | `10-triage-b.png`, `10-triage-http2-exposure.png` | Image D: `x/net` 0.23.0 or later and a current Go, step 13. **Fixed in D (step 13):** `x/net` v0.62.0, Go 1.27.4 |
| F18 | 11 | **Image C has no OS CVEs and no shell.** `cgr.dev/chainguard/static` (digest `fc42af33…a8d9`, signature verified) holds 3 Wolfi packages (`ca-certificates-bundle`, `tzdata`, `wolfi-baselayout`) and 1,254 files, 1,201 of them time-zone data. C is 19 MB on disk (5.62 MB compressed). What's left are the app's **69** CVEs (Grype): 60 in Go 1.18.10's standard library and 17 in modules, identical to A and B, because the binary is byte for byte the same (SHA-256 `ec6fa6de…`) | 1 and 6 (done); 3 and 4 remain | `11-image-c-compare-abc.png`, `11-image-c-inside.png`, `11-image-c-binary-sizes.png` | Layers 3 and 4: image D, step 13. **Done in D (step 13):** 0 and 0 |
| F19 | 12 | **A compiler upgrade alone removes every standard-library CVE.** The untouched code built with Go 1.27.4 (exit 0, `go/` unchanged) and answered Hello World. Grype on that binary: 60 standard-library CVEs → **0**; modules 17 → 16; total 69 → **16**. govulncheck: 62 reachable → **11**, all in `x/net` | 3 (and 4) | `12-newgo-build-run.png`, `12-newgo-compare.png`, `reports/after/newgo-binary-grype.*`, `govulncheck-binary-newgo.txt` | The compiler upgrade is cheap here; the remaining 16 need the `go.mod` update. Both go into image D, step 13. **Done in D (step 13):** 0 |
| F20 | 13 | **Image E (built at step 13, then called D) has no known vulnerabilities.** Grype 0, Trivy 0, govulncheck 0 (source and binary mode), on the same databases as A, B and C. The zero is real: both scanners saw E's 3 Wolfi packages and 21 Go packages (19 modules, the standard library, the app itself) and matched nothing. E runs as 65532:65532, has no shell, runs in release mode, trusts no proxy headers and has server timeouts | 1, 3, 4, 5 and 6 | `13-image-d-compare-abcd.png`, `13-image-d-scan-coverage.png`, `13-image-d-trivy-clean.png`, `reports/after/d-*` | Done. The zero holds for today's databases; step 14 rescans all four images together. **Confirmed at step 14:** 0 on the same-day rescan; no shell, BusyBox or package manager among E's 1,254 files. Image D (step 37) scans the same: 0 in Grype, Trivy and govulncheck; it keeps F1, F2 and F8 |
| F21 | 13 | **The update widened the supply chain.** `go.mod` went from 19 to 30 required modules, and the binary from 15 to 19 compiled-in modules: an HTTP/3 stack (`quic-go`, `qpack`), MongoDB's BSON library and `goccy/go-yaml` come in through Gin itself, and `gabriel-vasile/mimetype` through `go-playground/validator`. This app uses none of them. The binary nearly doubled: 11.7 MB → 20.2 MB on the same Go 1.27.4 | 4 | `13-image-d-gomod-table.png`, `13-image-d-binary-modules.png`, `13-image-d-why-modules.png` | Accepted: they scan clean today. It's more code to keep current, which argues for updating and rebuilding continuously rather than once |
| F22 | 13 | **The builder decides the build environment's risk, not what ships.** `golang:latest` and `chainguard/go` (both Go 1.27.4) produce final images with the same findings: 0. The builders themselves differ: `golang:latest` has 325 CVEs (10 Critical), one of them on CISA's KEV list (CVE-2026-123158 in `openssh-client`), 208 Debian packages and all ten tools we check for; `chainguard/go` has 0 CVEs and 66 Wolfi packages. Both run as root (user 0) | 2 (the build environment, not shipped) | `13-image-d-builders.png`, `13-image-d-builder-kev.png`, `reports/after/builder-*` | Image D builds on `chainguard/go`. Build stages run as root and download code, so their CVEs matter even though nothing from them ships except the binary |
| F23 | 15 | **For Go, an SBOM-based scan reports module-level risk, not what's in the binary.** Grype from the SBOM: C 158 against 69 from the image, B 250 against 161; the extra IDs are exactly the module-level matches Trivy reports. A pipeline or registry that scans SBOMs instead of images will show the higher number | Method (layers 3 and 4) | `15-sbom-scan-counts.png`, `15-sbom-scan-matches-trivy.png`, `reports/sbom/` | Use image (binary) scans for the primary count, and govulncheck for reachability; use SBOM scans for inventory and continuous monitoring, and expect module-level counts from them |
| F24 | 16 | **E's provenance (E was called D until step 37) doesn't prove how E was built.** It's unsigned, its builder ID is empty, it was made by the build VM itself (SLSA Build Level 1 at most), and its commit points at code that wasn't the code built (surprise 34) | 6 (the build process) | `16-registry-provenance-deps.png`, `16-registry-provenance-commit.png`, `reports/provenance/e-buildkit-provenance.json` | Build in CI from a clean checkout and sign the provenance there (steps 17 and 20); judge provenance by who made and signed it, not by how precise it looks |
| F25 | 16 | **The lab's registry is lab-grade.** `registry:3` runs as root, serves plain HTTP with no authentication on the VM's network, and has 22 known CVEs (2 Critical) | 6 (infrastructure) | `16-registry-2-vs-3.png`, `16-registry3-running.png`, `reports/after/registry3-grype.json` | Accepted for a single-user lab on a private network. In production: an access-controlled registry with TLS, or a managed one |
| F26 | 19 | **The cluster doesn't check signatures.** Image C, which cosign says has "no signatures found", deployed and ran (2/2) with the same manifest. Pod Security checks how a pod runs, not where its image came from | 6 (deployment) | `19-unsigned-c-runs.png`, `logs/19-deploy.log` | An admission policy that admits only images signed by the expected key or CI identity (Sigstore's policy-controller or Kyverno): the first thing to add. **Fixed at step 20:** a Kyverno policy refuses any image from the lab registry not signed with the lab key; unsigned C and an image pushed around the gate were refused, E (then called D) and the pipeline's images admitted |
| F27 | 20 | **The self-hosted runner has a wide reach.** It runs each pull request's code as the VM user that has Docker (root-equivalent), the cluster's admin kubeconfig and the signing key; the deploy job also receives the key's password | 6 (the pipeline) | `logs/20-ci.log`, `ci/hello-ai/.github/workflows/` | Acceptable for a private, single-user repo, where no stranger's pull request can run. In production: ephemeral runners, keyless signing with the workflow's identity, a deploy credential limited to one namespace, and build and deploy as separate jobs |
| F28 | 20 | **The gate can't block a merge.** Branch protection on a free private repository needs GitHub Pro (HTTP 403), so the red or green check is visible on every pull request but merging is a convention | 6 (the pipeline) | `logs/20-ci-mac.log` | A paid plan; and meanwhile two backstops: the deploy job runs the gate again on what was merged, and the cluster refuses anything unsigned |
| F29 | 21 | **The gate's blind spots.** It hides the build's output, so an agent can't see why a build failed; it never starts the container, so an entrypoint bug and a port mismatch passed it and only surfaced in review; it accepts a named user (`app`) that Kubernetes' `runAsNonRoot` can't verify; and it accepts a `-dev` runtime image (shell and package manager) as long as it's Chainguard and pinned | 5 and 6 (the pipeline) | `ci/agent-runs/`, `logs/21-agent*.log` | Print the tail of a failed build; start the image and `curl` the port the manifest expects; require a numeric `USER`; require the minimal image in the last stage |
| F30 | 21 | **The agent runs with the user's reach.** Tool allowlists limited it here (files, read-only `gh`, two commands on the VM, no `git`), but it ran on the Mac under the user's account; a looser setup gives it everything the user can reach. Read-only shell commands ran without approval too, `git show` of an earlier commit among them (surprise 50); since step 24 the console denies git to the agent outright | 6 (the pipeline) | `ci/agent-runs/README.md` | A sandbox for the agent with no stored credentials, network rules and an audit trail (what Chainguard's Workspaces is for); keep pushes and merges with a person |
| F31 | 24 | **Skills reach the agent unvetted by default.** The agent loads any skill in the project's `.claude/skills/` and, unless told otherwise, every skill installed for the user, with no scan, no signature and no pin; a skill acts with the agent's permissions | 6 (the pipeline) | `logs/24-skill-gate.log`, `reports/skills/` | A skill gate before install (SkillSpector here, content hash checked after the copy), project-only settings for the agent, and a vetted source of skills (what Chainguard Agent Skills is for) |
| F32 | 31 | **Debug containers get past the signature policy.** Unsigned image C, refused as a new pod, was admitted as a debug container in a running E pod (`kubectl debug`; E was then called D) and started. The policy matches `pods` on CREATE and UPDATE, and `kubectl debug` adds a container through the `pods/ephemeralcontainers` subresource; its rule also checks only `images.containers` | 6 (deployment) | `logs/31-debug-d.log`, `31-debug-gap.png`, `tools/debug-e.sh gap` | Open. Extend the admission policy to debug containers, or let only a few people add them (RBAC on `pods/ephemeralcontainers`); neither fix is tested here. Debugging itself works under the restricted level with a signed, pinned debug image (`tools/debug-e.sh k3s`) |
| F33 | 33 | **E's labels describe its base image** (E was called D until step 37; D, built then, has the same labels). `docker image inspect hello:d`, now `hello:e`, shows `Author: github.com/chainguard-dev/apko` and the 8 labels of Chainguard's `static` (title `static`, its source and URL, `created` 28 October). The build keeps the base's Author and labels, and Dockerfile E sets none, so a tool that inventories images by their OCI labels could take E for Chainguard's `static` | 6 (the build process) | `logs/33-inspect.log` | Open. Set the OCI labels in E's final stage (title, source, revision, created), or have the CI build add them; not done here, because it changes E's digest, which is scanned, signed and deployed |
| F34 | 36 | **D's module update skipped the lab's own 7-day cooldown.** `go get -u` on 16 November (step 13) took `golang.org/x/crypto v0.59.0`, dated 11 November by the Go proxy: 5 days old. The 7-day rule applied to Kyverno and to hello-ai's packages didn't cover D's modules. Through Chainguard Libraries on the free plan, that version wouldn't be served until about 18 November | 4 | `logs/36-libraries.log`, `36-module-dates-cooldown.png`, `logs/13-image-d.log` | Open. Hold module updates to versions at least 7 days old, or take them through Chainguard Libraries, whose cooldown does that; not changed here, because it changes E's digest, which is signed and deployed. From about 18 November the version clears 7 days anyway; the missing piece is the rule |

---

## Step 00 · Prepare the Mac
**Guide:** Chapter 1 · **Run on:** the Mac (the installer asked for the Mac password) · **Log:** logs/00-prepare-mac.log

**Goal.** Get the Mac ready to host the lab VMs, and create the private GitHub repo that will hold the work.

**What we did.**
- Installed Multipass with Homebrew. The installer ran with `sudo` because it adds a system service, `multipassd`, which runs the VMs.
- Checked that the client and the service both respond.
- Created the private repo `saadallahchebaro/chainguard-technical-challenge` with your personal account, then switched `gh` back to your work account.
- Checked the Mac's resources and confirmed Docker Desktop was closed.

**What came out.**

| Check | Result |
|---|---|
| Multipass | 1.17.1, client and service both running |
| Virtualization driver | `qemu` (Multipass's default on Apple Silicon) |
| Mac | macOS 26.7.3, arm64, 10 CPUs, 16 GB RAM |
| Free memory at the time | 42%, about 6.7 GB |
| Free disk | 224 GB |
| Docker Desktop | Not running |
| GitHub repo | `saadallahchebaro/chainguard-technical-challenge`, private |
| Active `gh` account afterwards | the work account again |

**Surprises.** Nothing that changes the plan. Homebrew updated itself before installing and printed two deprecation warnings from an unrelated third-party tap; they had no effect.

**Decisions.**
- The repo was created empty, so the challenge's own history can be pushed into it at step 01, with the original repo kept as `upstream`.
- 6.7 GB of free memory covers the build VM (4 GB). The k3s VM adds 3 GB at step 18, so close heavy apps before then.

**Evidence.** `logs/00-prepare-mac.log`

---

## Step 01 · Create the build VM, clone the repo, load the recorder
**Guide:** Chapter 1 · **Run in:** the tmux session `lab` on the VM · **Logs:** logs/01-vm-mac.log (Mac side), logs/01-vm.log (VM side)

**Goal.** Create the brief's Linux VM, get the challenge repo into it, connected to your private repo, and set up the record-keeping.

**What we did.**
- Created the build VM `chainguard` with Multipass: Ubuntu 24.04, 4 CPUs, 4 GB, 30 GB.
- Copied in the recorder (`tools/labrc.sh`) and the tmux settings, and started the tmux session `lab`, connected from a Terminal window on the Mac.
- Cloned the challenge repo and started recording (`step 01-vm`).
- Renamed the challenge repo's remote to `upstream` and added your private repo as `origin`.
- Created the guide's folders, plus `demo/screenshots` and `tools`, and moved the recorder into the repo (`~/.labrc.sh` now links to it).
- Brought in the documents prepared on the Mac, and appended the lab's entries to the repo's existing `.gitignore`.
- Set this repo's commit identity to your GitHub noreply address.
- Created an SSH deploy key on the VM, checked GitHub's host key fingerprint against GitHub's API, registered the key on your repo (write access, this repo only), and tested it.
- Committed and pushed for the first time.

**What came out.**

| Check | Result |
|---|---|
| VM | `chainguard`, Ubuntu 24.04.5 LTS, 4 CPUs, 3.8 GiB memory, 29 GiB disk, IP 192.168.252.2 |
| Clock | Matches the Mac to the second, NTP-synchronised. The time zone (Asia/Dubai) was copied from the Mac; logs use UTC |
| Already installed | git 2.43.0, jq 1.7.1, tmux 3.4 |
| Challenge repo | `main` at `42fd9eb`, five commits |
| Remotes | `origin` = your private repo (SSH), `upstream` = maligin/chainguard-technical-challenge |
| Commit identity | Saadallah Chebaro, `84092091+saadallahchebaro@users.noreply.github.com` (this repo only) |
| Deploy key | ED25519, `SHA256:ND86q3NLWVWsHOCa6kzJdSQKGFVJ7HcJIPhK0GHz+qo`, read-write, on this repo only |
| GitHub host key | `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, the same as GitHub publishes at api.github.com/meta |
| Key test | "Hi saadallahchebaro/chainguard-technical-challenge! You've successfully authenticated…" |

**Surprises.** Four, all in the list at the top: the slow first boot, the 192.168.252.x subnet, the tmux scroll-mode mix-up, and the repo's existing `.gitignore`.

**Decisions.**
- **A deploy key, not your account's credentials.** If the VM were compromised, the key could reach this one repo and nothing else. It has no passphrase, so pushes don't stop for a prompt. That's acceptable on a throwaway lab VM, and the key is deleted with the VM.
- **The host key was checked before the first connection,** against the fingerprint GitHub publishes, so the first push can't be sent to an impostor.
- **The clone happened before Docker was installed** (the guide does it the other way round), so every install from step 02 on is recorded.

**Evidence.** `logs/01-vm-mac.log`, `logs/01-vm.log`

---

## Step 02 · Install Docker Engine
**Guide:** Chapter 1 · **Run in:** the tmux session `lab` on the VM · **Logs:** logs/02-docker.log (VM), logs/02-docker-mac.log (Mac)
**Screenshots:** demo/screenshots/02-docker-hello-world.png, demo/screenshots/02-docker-version-storage.png

**Goal.** Install Docker Engine from Docker's own repository, let the `ubuntu` user use it without `sudo`, prove it works, and record where it stores images.

**What we did.**
- Checked that `ca-certificates` and `curl` were present (`ca-certificates` was updated).
- Downloaded Docker's apt signing key and checked its fingerprint against the one Docker publishes.
- Wrote Docker's repository file (`/etc/apt/sources.list.d/docker.sources`): the same six lines as the guide's heredoc, written with a one-line `printf`.
- Installed `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` and `docker-compose-plugin`.
- Added `ubuntu` to the `docker` group, and showed that the existing shell still couldn't use Docker.
- Restarted the tmux session from a fresh login so its shell got the group, and reconnected to it.
- Ran `docker run --rm hello-world`, then recorded the versions, the storage driver and the disk use.
- Started saving screenshots of the Terminal window (`tools/shot.sh`).

**What came out.**

| Check | Result |
|---|---|
| Docker's signing key | `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`, "Docker Release (CE deb)", the fingerprint Docker publishes |
| Repository | `download.docker.com/linux/ubuntu`, suite `noble`, `arm64`, signed by that key |
| Docker Engine, client and server | 29.9.3, API 1.56 |
| containerd / runc / docker-init | v2.4.2 / 1.5.3 / 0.19.0 |
| buildx / compose plugins | 0.39.0 / 5.7.1 |
| Also installed | `docker-ce-rootless-extras` 29.9.3 (recommended by `docker-ce`) |
| `docker` group | GID 988, member `ubuntu`. Socket: `srw-rw---- root docker /var/run/docker.sock` |
| Before reconnecting | `docker ps`: `permission denied … /var/run/docker.sock`, because the shell's groups were fixed when it started |
| After reconnecting | `id` includes `988(docker)`. `hello-world` was pulled (arm64, `sha256:cf1b20a0…0458`) and ran |
| Image storage | `Storage Driver: overlayfs`, `driver-type: io.containerd.snapshotter.v1`: the containerd image store. `/var/lib/containerd` 328K, `/var/lib/docker` 232K |
| Isolation | cgroup v2 (systemd driver); security options AppArmor, seccomp, cgroupns; runtime runc |
| Kernel | 6.8.0-147-generic, aarch64 |

**Surprises.** Three, added to the list at the top: `docker-ce-rootless-extras` arrived without being asked for, `docker images` reports two different sizes, and copying the repo to the Mac stalled on the first screenshot until `tools/sync-to-mac.sh` switched to `multipass transfer` with checksum verification.

**Decisions.**
- **Docker's repository, not Ubuntu's `docker.io` package:** Docker's own build, updated by Docker and matching its documentation, with the `buildx` and `compose` plugins.
- **The signing key was checked before anything was installed from it,** the same habit as checking Trivy's signature at step 04.
- **The standard install, with a root daemon and the `docker` group, is a deliberate trade-off.** The output shows `ubuntu` already has `sudo` (group 27), so the `docker` group gives no power this user didn't already have. In production, builds shouldn't run as root on the host: rootless Docker or BuildKit on build servers, and rootless BuildKit or Buildah in Kubernetes CI. Optional step 14b shows the rootless version.

**Correction.** Commit `5924dcf` says it changed `tools/sync-to-mac.sh`, but the file isn't in it. The new script was run before it was copied to the VM, so it unpacked the VM's old copy over itself. Commit `dda4848` adds the right file, and the script now refuses to overwrite newer files on the Mac.

**Evidence.** `logs/02-docker.log`, `logs/02-docker-mac.log`, the two screenshots.

---

## Step 03 · Install the tools
**Guide:** Chapter 1 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/03-tools.log
**Screenshots:** demo/screenshots/03-tools-go-verified.png, 03-tools-kubectl-cosign-verified.png, 03-tools-anchore-installer-review.png, 03-tools-grype-syft-verified.png, 03-tools-versions.png

**Goal.** Install the lab's tools from their official sources, verifying each download before installing it.

**What we did.**
- Downloaded everything into `~/downloads`, outside the repo.
- **Go:** looked up the newest release on go.dev, downloaded it, verified it against go.dev's published SHA-256, and installed it in `/usr/local/go`. The guide's `PATH` line for `~/.bashrc` was skipped, because `tools/labrc.sh` already adds `/usr/local/go/bin` and `~/go/bin` for every shell.
- **govulncheck and crane:** built with `go install`. Go checks every module against its checksum database.
- **kubectl:** verified against the SHA-256 that dl.k8s.io publishes, then installed.
- **cosign:** verified against the release's `cosign_checksums.txt`, then installed. That proves the download wasn't corrupted, not that the release is genuine: checking cosign's own signature would need a cosign you already trust.
- **Grype and Syft:** downloaded Anchore's install scripts and read their verification code before running them with `-v`, which checks the release's signature with cosign as well as the SHA-256. The script turned out to download and run a second script (surprise 8), so both binaries were then verified independently with cosign.
- Recorded every version on one screen.

**What came out.**

| Tool | Version | Verification |
|---|---|---|
| Go | 1.27.4 (linux/arm64) | SHA-256 `33925829…ac92` matches go.dev |
| govulncheck | v1.9.0 (database updated 2026-11-11) | Built from source by `go install` |
| crane | v0.22.1 | Built from source by `go install` |
| kubectl | v1.37.2 (current stable) | SHA-256 matches dl.k8s.io |
| cosign | v3.1.4 (built 2026-10-20) | SHA-256 matches the release checksums |
| Grype | 0.121.3 | Signature: Verified OK (Anchore release workflow). Archive SHA-256 OK. Installed binary = archived binary (`9d7014d4…d431`) |
| Syft | 1.57.1 | Signature: Verified OK. Archive SHA-256 OK. Installed binary = archived binary (`b0b37d4e…5365`) |

**Surprises.** One, added to the list at the top (8): the install script we read hands the job to a second script.

**Decisions.**
- **Verify every download before installing it,** and say exactly what each check proves. A checksum from the same release proves integrity; a signature tied to the project's release workflow proves origin.
- **Read the installer instead of piping it into `sudo sh`,** as the guide suggests. Reading it is what exposed the second script.
- **Verify the artifact, not the installer's success message.** For Grype and Syft, the independent `cosign verify-blob` is the evidence that counts.

**Evidence.** `logs/03-tools.log` and the five screenshots.

---

## Step 04 · Verify Trivy, then install it
**Guide:** Chapter 1 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/04-trivy.log
**Screenshots:** demo/screenshots/04-trivy-verified.png, demo/screenshots/04-trivy-installed.png

**Goal.** Install Trivy only after proving the package was built and signed by Aqua Security's own release workflow, for the release we asked for.

**Why it matters here.** In March 2026, attackers used stolen credentials from Trivy's release pipeline to publish a malicious Trivy v0.69.4 (CVE-2026-33634, on CISA's KEV list), then malicious Docker Hub images tagged 0.69.5 and 0.69.6. Aqua has removed them all.

**What we did.**
- Looked up the newest release with GitHub's API: **0.76.2**, published 2026-11-05. The guide's example was 0.76.1; a patch release has come out since. It isn't 0.69.4–0.69.6.
- Downloaded `trivy_0.76.2_Linux-ARM64.deb` (47 MB) and its Sigstore bundle, `.deb.sigstore.json` (10 KB).
- Verified the package with `cosign verify-blob`, requiring the signer to be Aqua's `reusable-release.yaml` workflow at tag `v0.76.2`, through GitHub's OIDC issuer.
- Ran the same check with a deliberately wrong tag (`v0.76.1`) to show what the check enforces.
- Installed the verified file with `apt-get install ./trivy_0.76.2_Linux-ARM64.deb`, then confirmed the version and the package's maintainer.

**What came out.**

| Check | Result |
|---|---|
| Newest release | v0.76.2 (2026-11-05); not one of the compromised 0.69.4–0.69.6 |
| Signature, correct identity (`…/reusable-release.yaml@refs/tags/v0.76.2`) | **Verified OK** |
| Signature, wrong identity (`…@refs/tags/v0.76.1`) | **Refused**, exit code 1: `expected SAN value "…@refs/tags/v0.76.1", got "…@refs/tags/v0.76.2"` |
| Installed | `/usr/bin/trivy`, Version 0.76.2, maintainer "Aqua Security <oss@aquasec.com>"; no apt warnings |

**Surprises.** None. The check behaved exactly as designed.

**Decisions.**
- **Verify before installing, with the identity pinned to the exact tag.** Pinning the tag, not just the workflow, means a genuine signature from a different Trivy release is refused too, as the wrong-identity test shows.
- **Install the verified file itself** (`./…deb`), not a fresh download, so what's installed is exactly what was verified.

**What the check proves, and what it doesn't.** It proves the package came from Aqua's release workflow for v0.76.2, as recorded in the certificate's SAN. It doesn't prove that pipeline was clean: Aqua says the malicious 0.69.4 was published through Trivy's own release automation, so a check like this may well have passed for it. That's why signatures go with provenance (which commit, which build), short-lived credentials, pinning by digest, and refusing versions the vendor has flagged. The tools in your pipeline, a security scanner included, are part of your supply chain.

**Evidence.** `logs/04-trivy.log` and the two screenshots.

---

## Step 05 · Record the versions, then run the app as delivered
**Guide:** Chapter 1 · **Run in:** the tmux session `lab` on the VM · **Logs:** logs/05-versions.log, logs/05-sanity.log
**Screenshots:** demo/screenshots/05-versions.png, 05-sanity-dns-fix.png, 05-sanity-built.png, 05-sanity-app-runs.png, 05-sanity-old-toolchain.png

**Goal.** Record every tool's version, then prove the app works as delivered before packaging it: built with Go 1.18, the version its `go.mod` names, and run directly on the VM.

**What we did.**
- Added `tools/versions.sh`, which prints one line per tool, and recorded the full list.
- Built the app with Go 1.18 in a throwaway `golang:1.18` container that mounted `go/`, with `CGO_ENABLED=0` as the repo's `go/README.md` asks. **It failed**: Go couldn't resolve `proxy.golang.org` from inside the container (surprise 9).
- Diagnosed the failure: compared the VM's and the container's DNS settings, then tested each DNS server with `dig`.
- Set Docker's default DNS to `1.1.1.1` and `8.8.8.8` in `/etc/docker/daemon.json`, restarted Docker, and checked that a container resolves names.
- Built again; it worked.
- Split the tmux window: ran `hello-server` on the left and `curl -i localhost:8080` on the right. Then stopped the server.
- Recorded the binary's owner.
- Recorded how old the toolchain is: when `golang:1.18` was built, the Go and Debian inside it, the Go versions go.dev still supports, the end-of-life dates for Go 1.18 and Debian 11 (from endoflife.date), and Gin 1.8.1's release date against the latest. Every finding so far went into the findings register at the top (F1–F7).

**What came out.**

| Check | Result |
|---|---|
| Versions | Ubuntu 24.04.5 LTS, kernel 6.8.0-147 (aarch64), Docker 29.9.3, containerd v2.4.2, buildx v0.39.0, Go 1.27.4, Grype 0.121.3, Syft 1.57.1, Trivy 0.76.2, govulncheck v1.9.0, cosign v3.1.4, crane v0.22.1, kubectl v1.37.2 |
| `golang:1.18` image | Pulled, digest `sha256:50c889275d26f816b5314fc99f55425fa76b18fcaf16af255f5d57f09e1f48da` |
| DNS servers | VM: 127.0.0.53 (systemd-resolved) → 192.168.252.1 **and** an IPv6 server. Container: 192.168.252.1 only |
| `dig` from the VM | 192.168.252.1: **timed out**. The IPv6 server, 1.1.1.1 and 8.8.8.8: answered |
| After the fix | A container gets `nameserver 1.1.1.1` and `8.8.8.8`, and `proxy.golang.org` resolves |
| Modules downloaded by the build | Gin v1.8.1; `golang.org/x/net` 2021-02-26; `x/crypto` 2021-07-11; `x/sys` 2021-08-06; `x/text` v0.3.6; `protobuf` v1.28.0; and others. All fixed by `go.mod` |
| Binary | `go/hello-server`, 9,761,868 bytes, owned by **root:root** |
| Startup warnings | Gin is in "debug" mode; "You trusted all proxies, this is NOT safe"; `PORT` undefined, so `:8080` |
| `curl -i localhost:8080` | `HTTP/1.1 200 OK`, `text/plain`, 12 bytes: **Hello World!** The server logged `200 … ::1 … GET "/"` |
| How old the builder is | `golang:1.18` built **2023-01-11**: go1.18.10 on **Debian 11 (bullseye)** |
| Go versions still supported | go.dev lists **go1.27.4 and go1.26.11** only. Go 1.18: end of life **2023-02-01** (endoflife.date) |
| Debian 11 support | Security support ended **2024-08-14**, LTS ended **2026-08-31**; paid extended support only (endoflife.date) |
| Gin | v1.8.1 released **2022-06-06**; latest v1.12.0, released 2026-02-28 |

**Surprises.** One, added to the list at the top (9): containers couldn't resolve names until Docker was given DNS servers that answer.

**Decisions.**
- **Public DNS for Docker in the lab.** It's the simplest fix that survives a reboot. In a company you'd put the company's internal resolvers in the same `daemon.json` setting. The alternative, making the VM's own resolver listen on Docker's network, has more moving parts.
- **Build with Go 1.18 only, for now.** Whether today's Go can build this 2021 code is image D's question (step 12), so each step changes one thing.

**Why the binary belongs to root.** The Docker daemon runs as root, so the container's root user wrote the file as the VM's real root through the mounted folder. With rootless Docker, the same container root would map to `ubuntu` and the file would belong to `ubuntu`. It's a small, visible example of what rootless changes (optional step 14b).

**Evidence.** `logs/05-versions.log`, `logs/05-sanity.log` and the four screenshots.

---

## Step 06 · Look inside the app before packaging it
**Guide:** Chapter 2 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/06-app.log
**Screenshots:** demo/screenshots/06-app-source.png, 06-app-buildinfo.png, 06-app-gin-source.png, 06-app-static.png, 06-app-gitignore-melange.png

**Goal.** Understand what we're packaging, and see the binary the way a scanner will, before writing any Dockerfile.

**What we did.**
- Read `main.go` and `go.mod`, and counted the dependencies.
- Printed the build record inside `go/hello-server` with `go version -m`, which is what Grype and Trivy read, and compared its module list with `go.mod`.
- Checked Gin v1.8.1's source at its release tag: what `r.Run()` does, and which JSON code is compiled by default. Then checked Go's documentation for what a zero server timeout means.
- Confirmed the binary is static with `file` and `ldd`.
- Copied `go/` to `go-patched/`, without the binary, and proved the copy identical with `diff`.
- Noticed what the app folder's own `.gitignore` excludes.

**What came out.**

| Check | Result |
|---|---|
| `main.go` | 15 lines: `gin.Default()` (logger and crash-recovery middleware), one route `/` returning "Hello World!", then `r.Run()` on `0.0.0.0:8080` |
| `go.mod` | `go 1.18`; **1** direct dependency (Gin v1.8.1) and **18** indirect; `go.sum` 86 lines |
| Build record (`go version -m`) | Built by **go1.18.10**; **15** `dep` modules; `CGO_ENABLED=0`, `GOARCH=arm64`, `GOOS=linux` |
| Modules in `go.mod` but not in the binary | `goccy/go-json`, `json-iterator/go`, `modern-go/concurrent`, `modern-go/reflect2`: Gin's JSON alternatives, behind build tags |
| `r.Run()` in Gin v1.8.1 | `http.ListenAndServe(address, engine.Handler())` (gin.go line 382): Go's server with no timeouts |
| `file` | "ELF 64-bit LSB executable, ARM aarch64, … **statically linked**, Go BuildID=…, not stripped" |
| `ldd` | "**not a dynamic executable**" (exit code 1, normal for a static binary) |
| `go-patched/` | Identical to `go/` apart from the binary |
| `go/.gitignore` | `melange.rsa`, `melange.rsa.pub`, `packages/`, `output.tar`, `sbom-*` |

**Surprises.** One, added to the list at the top (10): the app folder's `.gitignore` points at melange and apko.

**Findings.** Two new rows in the register: F8 (no server timeouts, layer 5, fixed in image D) and F9 (the binary carries 15 modules, `go.mod` lists 19, which matters when comparing scans).

**Decisions.**
- **Check the library's source, not just its documentation.** The timeout finding comes from Gin v1.8.1's own code at its release tag and Go's own documentation, not from a scanner. No CVE scanner reports it, which is layer 5's whole point.
- **Keep `go/` untouched.** Images A to C build from it, image D from `go-patched/`, so each image changes exactly one thing.

**Why it matters for the scans.** The binary's build record is the scanners' only view of layers 3 and 4. They'll report Go 1.18.10's standard-library CVEs and the 15 modules' CVEs, whichever base image the binary sits on, because those are inside the file.

**Evidence.** `logs/06-app.log` and the five screenshots.

**Checkpoint 1 (after step 06).** The setup stage is complete: steps 00–06 are pushed to GitHub and copied to the Mac. The VM's shell history stays on the VM for now.

---

## Step 07 · Image A: single-stage on `golang:1.18`
**Guide:** Chapters 3 and 5 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/07-image-a.log
**Screenshots:** demo/screenshots/07-image-a-dockerfile.png, 07-image-a-build.png, 07-image-a-index-sizes.png, 07-image-a-run-checks.png, 07-image-a-inside.png, 07-image-a-history.png

**Goal.** The baseline: the simplest Dockerfile, built and run in `golang:1.18`, with everything it ships made visible.

**What we did.**
- Deleted the root-owned binary left in `go/` by step 05, so `COPY . .` copies only source. (A `.dockerignore` would prevent this in a real project.)
- Wrote `dockerfiles/Dockerfile.a-single`: the guide's eight instructions, with comments.
- Built it with `docker build --progress=plain -t hello:a -f dockerfiles/Dockerfile.a-single ./go`.
- Read the export lines, then confirmed with `docker image ls --tree` and containerd (`ctr -n moby content get`) that `hello:a` is an index holding the image and a provenance attestation.
- Measured both sizes, for A and for its base.
- Ran the checks: `docker run -d -p 8080:8080`, `curl`, the user in the image config, `id` inside, whether a shell exists, and Gin's log.
- Looked inside: the OS, the package count, which tools exist, our source and the module sources.
- Read the layer history, then removed the container.

**What came out.**

| Check | Result |
|---|---|
| Build | Base `golang:1.18@sha256:50c88927…48da`; `go mod download` 26.6 s; `go build` 2.4 s. Modules downloaded fine, so builds use the step-05 DNS fix |
| What was exported | Image manifest `sha256:c5d6df58…`, config `sha256:26f7294a…`, **attestation manifest** `sha256:034c4f7b…`, **index** (manifest list) `sha256:9457bcf6…` |
| Index entries (from containerd) | `linux/arm64` (`c5d6df5819ad`); `unknown/unknown`, type `attestation-manifest` (`034c4f7b4f58`): **Docker 29's default provenance** |
| Size of `hello:a` | **1.49 GB** on disk (`DISK USAGE`); **374 MB** compressed (`CONTENT SIZE`) |
| Size of the base `golang:1.18` | 1.22 GB on disk; 315 MB compressed |
| `curl localhost:8080` | **Hello World!** (Gin logged the request from `172.17.0.1`, Docker's bridge gateway) |
| User | Image config `User` empty; `id`: **`uid=0(root) gid=0(root)`** |
| Shell | Yes: `/bin/sh` (dash) and `/bin/bash` |
| OS and packages | Debian 11 (bullseye), **201** packages |
| Tools inside | `go`, `gcc`, `git`, `make`, `curl`, `wget`, `apt-get`, `perl`, `python3`, `ssh`: **all present** |
| Shipped besides the app | `/usr/local/go` 338 MB; `/go/pkg/mod` 139 MB; our source in `/app` |
| Binary | 9,761,868 bytes, the same size as step 05's build (same Go, same code) |
| Layers | 20 in all: our 7 (the module download 145 MB, the build 62.2 MB) on top of 13 from `golang:1.18`, all "3 years ago" (Go toolchain 354 MB; apt installs 166 MB and 218 MB; Debian root filesystem 135 MB) |

**Surprises.** One, added to the list at the top (11): A is 1.49 GB on disk, not the "around 1 GB" the guide estimated.

**Findings.** Two new rows in the register: F10 (A ships its whole build environment, layers 1 and 2) and F11 (root, with a shell, layer 6). F3's "full cost" is now measured.

**Decisions.**
- **Sizes: report both, clearly labelled** (this settles surprise 6). The headline is the size on disk, what runs and what a scanner walks through; the compressed size is what every pull downloads.
- **Default provenance stays for now.** It answers the plan's open question early: Docker 29 attaches it to every build, so what we push and sign at steps 16–17 is an index. Whether to keep it gets decided there.

**Evidence.** `logs/07-image-a.log` and the six screenshots.

---

## Step 08 · Image B: multi-stage, onto `debian:trixie-slim`
**Guide:** Chapters 4 and 5 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/08-image-b.log
**Screenshots:** demo/screenshots/08-image-b-dockerfile.png, 08-image-b-build.png, 08-image-b-sizes-bases.png, 08-image-b-run-checks.png, 08-image-b-inside.png, 08-image-b-history.png, 08-image-b-compare-a-b.png

**Goal.** Change one thing: keep A's build, but ship only the binary on a slim, current base as a non-root user, and measure what that removes and what it leaves.

**What we did.**
- Wrote `dockerfiles/Dockerfile.b-multi`: the guide's version, with comments, including `USER 65532` as written.
- Built it. All five build-stage steps came from A's cache; only the base pull and the binary copy were new.
- Measured both sizes, and compared the two bases' build dates and support status.
- Ran the checks on port 8081: `curl`, the user in the image config, `id` inside, `/etc/passwd`, the shell, Gin's log.
- Looked inside: the OS, the package count, the same ten tools as in A, our files. Then read the layer history.
- Added `tools/compare.sh` and compared A with B in one table. Then removed the container.

**What came out.**

| Check | Result |
|---|---|
| Build | Build stage: 5 of 5 steps `CACHED`. Runtime base `debian:trixie-slim@sha256:a72b4433…b6b2` (one 30 MB compressed layer). Index `711ca363…` with attestation manifest `abd2c68e…` (default provenance, like A) |
| Size of `hello:b` | **155 MB** on disk; **35.4 MB** compressed (A: 1.49 GB and 374 MB, so about 90% smaller on both) |
| Runtime base | `debian:trixie-slim` built **2026-11-04**, Debian 13; security support until 2028-08-09, LTS until 2030-06-30 (endoflife.date). 142 MB on disk, 32.2 MB compressed |
| `curl localhost:8081` | **Hello World!** |
| User | Image config `65532`; `id`: **`uid=65532 gid=0(root) groups=0(root)`**; 65532 isn't in `/etc/passwd` |
| Shell | Yes: `/bin/sh` (dash) and `/bin/bash` |
| OS and packages | Debian 13 (trixie), **78** packages (A: 201) |
| Tools of the ten found in A | Only `apt-get` and `perl` remain |
| Our files | Only `/usr/local/bin/hello-server` (9,761,868 bytes, the same binary as A's); no `/app`, no `/go` |
| Layers | **5** (A: 20): the Debian 13 base (110 MB, built 11 days ago by Debian's `debian.sh`), the binary (9.78 MB), and `USER`, `EXPOSE`, `ENTRYPOINT` |

`tools/compare.sh hello:a hello:b`:
```
image     disk      compressed  packages  user uid:gid   shell  tools found
hello:a   1.49GB    374MB       201       0:0            yes    go gcc git make curl wget apt-get perl python3 ssh
hello:b   155MB     35.4MB      78        65532:0        yes    apt-get perl
```

**Surprises.** One, added to the list at the top (12): BuildKit didn't register the base image by name.

**Findings.** Two new rows: F12 (group 0) and F13 (shell, package manager and perl remain). Progress: F10 mostly done in B, F11 half done, F5 done. Not touched: F3, F4 and F6. The binary inside B is the same Go 1.18 build, with the same modules.

**Decisions.**
- **Keep `USER 65532` as the guide writes it,** to show the group-0 gotcha, and record the fix (`USER 65532:65532`) as a finding instead of hiding it.
- **Port 8081 for B,** so A to D can run side by side on 8080–8083 in the demo.

**What multi-stage did and didn't do.** It removed everything that was only needed to build: the compiler, git, the toolchain, our source, the module cache and the build cache, 123 packages in all. It didn't touch what's inside the binary, so Go 1.18's standard library and Gin 1.8.1 are exactly what they were in A. And a slim Debian is still Debian: a shell, a package manager and 78 packages, each with its own CVEs. Step 09's scans will show which layer each CVE belongs to.

**Evidence.** `logs/08-image-b.log` and the seven screenshots.

---

## Step 09 · Scan images A and B
**Guide:** Chapter 6 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/09-scan-ab.log
**Screenshots:** demo/screenshots/09-scan-versions-db.png, 09-scan-grype-breakdown.png, 09-scan-trivy-kernel-headers.png, 09-scan-govulncheck.png, 09-scan-counts.png, 09-scan-b-criticals.png

**Goal.** Scan A and B with two scanners, save every report as JSON, SARIF and a table, record exactly which scanner and database produced them, and check the numbers before trusting them.

**What we did.**
- Added `tools/count.sh` (the guide's `jq` queries in one place; it counts each ID once, at its highest severity).
- Updated both databases, then saved the versions and database dates to `reports/before/scanner-versions.txt`.
- Grype on A and B (`--by-cve`, table + JSON + SARIF in one run each).
- Trivy on A and B, once each to JSON (`--no-progress`), then `trivy convert` to a table and SARIF, so all three describe the same scan.
- Checked two numbers that didn't match the guide: A's stdlib count (surprise 13) and Trivy's huge A count (surprise 14).
- Grype on the source folder (`dir:./go`).
- govulncheck in source mode on `go/`, and in binary mode on the binary copied out of B.
- Compressed A's three largest reports for the repo; changed the Mac copy to git's file list.

**What came out.**

Scanner versions and databases: Grype 0.121.3 with database schema v6.1.10, built 2026-11-16 06:30 UTC; Trivy 0.76.2 with database v2, updated 2026-11-16 07:10 UTC.

| Unique CVE IDs | Total | Critical | High | Medium | Low | Negligible | Unknown | Fixable |
|---|---|---|---|---|---|---|---|---|
| Grype, A | **734** | 46 | 225 | 230 | 38 | 194 | 1 | 374 |
| Grype, B | **161** | 5 | 55 | 59 | 9 | 26 | 7 | 72 |
| Trivy, A | **10,856** | 36 | 1,787 | 7,365 | 1,646 | — | 22 | 4,891 |
| Trivy, B | **253** | 4 | 80 | 123 | 39 | — | 7 | 160 |
| Grype, source folder | **66** | 9 | 28 | 27 | 1 | — | 1 | 66 |

| By layer (unique IDs) | A, Grype | B, Grype | A, Trivy | B, Trivy |
|---|---|---|---|---|
| OS packages (Debian) | 603 | 92 | 10,700 (9,928 on `linux-libc-dev`) | 96 |
| The Go toolchain as a program (`go` 1.18.10) | 118 | — | — | — |
| Go standard library | 87 (60 on the app binary) | 60 | 104 | 104 |
| Go modules | 17 | 17 | 64 | 64 |

| govulncheck | Reachable (called) | Imported, not called | Required, not imported |
|---|---|---|---|
| Source mode on `go/` (judges stdlib by Go 1.27.4) | 11, all `x/net` | 8 | 44 |
| Binary mode on B's binary (go1.18.10) | **62**: 49 stdlib, 12 `x/net`, 1 `x/text` | 32 | 55 |

Image B's Critical findings (Grype), all inside the binary: CVE-2023-24538 and CVE-2023-24540 (stdlib, EPSS 2.3% and 1.6%), CVE-2025-68121 and CVE-2025-22871 (stdlib), CVE-2026-78663 (stdlib and `x/net`, fixed in `x/net` 0.60.0).

**Surprises.** Four, added to the list at the top: 13 (A's stdlib count includes the toolchain's programs), 14 (Trivy counts the kernel headers, Grype doesn't), 15 (scan modes disagree on modules; open), 16 (A's reports are too big for the repo uncompressed).

**Findings.** Two new rows: F14 (every Critical left in B is inside the binary) and F15 (62 reachable in what B ships). F10 and F5 gained evidence from the scans.

**Decisions.**
- **Grype is the primary count, Trivy the second opinion,** and both are kept. The report states each scanner's policy differences instead of picking the bigger or smaller number.
- **Count unique IDs, each once at its highest severity,** so the severity columns add up to the total.
- **Compare like with like:** for the standard library, count the app's binary, not every Go program in the image.
- **Two govulncheck modes, two questions:** source mode for "does my code call it", binary mode for "what actually shipped".

**Evidence.** `reports/before/` (JSON, SARIF, tables, `scanner-versions.txt`, govulncheck output), `logs/09-scan-ab.log` and the six screenshots.

---

## Step 10 · Make sense of the results
**Guide:** Chapter 7 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/10-triage.log
**Screenshots:** demo/screenshots/10-triage-module-gap.png, 10-triage-gap-analysis.png, 10-triage-b.png, 10-triage-http2-exposure.png, 10-triage-a-kev.png

**Goal.** Explain why the scanners disagree, then turn the lists into a ranked set of what actually matters, with evidence for each judgement.

**What we did.**
- Broke the Go findings down by source (namespace) and by module, comparing Grype on the binary, Trivy on the binary, and Grype on `go.mod`.
- Looked up the Trivy-only IDs in Grype's database (`grype db search`, by CVE and by GHSA/GO aliases).
- Listed the packages and functions compiled into B's binary (`go tool nm`), and read Grype's `gosymbols` qualifier at v0.121.3.
- Wrote `tools/gap-analysis.sh`, which classifies every Trivy-only Go ID; ran it on B.
- Downloaded CISA's KEV catalog (2026.11.13, 1,781 entries) and saved govulncheck's JSON for the binary and the source.
- Wrote `tools/triage.sh`: ranks unique CVEs by KEV, then whether the vulnerable function is in the binary, then EPSS, then severity, with a "called" column from source mode.
- Checked Go's advisory for the Rapid Reset IDs, then tested whether the running server speaks HTTP/2.
- Ranked A the same way.

**What came out.**

Why Grype and Trivy differ on the Go layers (`tools/gap-analysis.sh` on B):

| | Grype | Trivy | Trivy-only | Package not compiled in | Package in, no vulnerable function | Vulnerable function present |
|---|---|---|---|---|---|---|
| Go modules | 17 | 64 | 48 | 42 | 6 | 0 |
| Go standard library | 60 | 104 | 44 | 15 | 28 | 1 (CVE-2026-39821) |

Example: Gin's CVE-2023-29401 is in Grype's database (GHSA-2c4m-59x9-fr2g, `github:language:go`, "<1.9.1"), but its function `Context.FileAttachment` isn't in the binary (`go tool nm`: 0), so Grype doesn't report it. For `x/net` CVE-2022-41717, Grype recorded the functions it found: `http2.Server.ServeConn` and `serverConn.canonicalHeader`.

Image B, ranked (top 9 of 12):

| CVE | Severity / CVSS | EPSS | KEV | In binary | Called | Package | Fixed in |
|---|---|---|---|---|---|---|---|
| CVE-2023-44487 | Medium 6.9 | 0.99999 (p99) | **yes** | no (Go files it as 39325) | no | `x/net` 2021-02 | 0.17.0 |
| CVE-2023-45288 | High 7.5 | 89.46% (p99) | – | yes | yes | `x/net` | 0.23.0; Go 1.21.9/1.22.2 |
| CVE-2022-41717 | Medium 5.3 | 6.2% | – | yes | yes | `x/net` | 0.4.0 |
| CVE-2022-41723 | High 7.5 | 4.56% | – | yes | yes | `x/net` | 0.7.0; Go 1.19.6/1.20.1 |
| CVE-2021-44716 | High 7.5 | 4.25% | – | yes | yes | `x/net` | Dec 2021 snapshot |
| CVE-2023-39325 | High 7.5 | 3.8% | – | yes | yes | `x/net` | 0.17.0; Go 1.20.10/1.21.3 |
| CVE-2021-31525 | Medium 5.9 | 3.69% | – | yes | yes | `x/net` | Apr 2021 snapshot |
| CVE-2022-27664 | High 7.5 | 3.49% | – | yes | yes | `x/net` | Sep 2022 snapshot |
| CVE-2023-24538 | **Critical 9.8** | 2.28% | – | yes | (stdlib) | Go 1.18.10 | Go 1.19.8/1.20.3 |

HTTP/2 exposure test on B: an HTTP/2 connection was refused (curl exit 56); an upgrade offer got HTTP/1.1 200. Gin v1.8.1's `Handler()` only adds HTTP/2 over cleartext when `UseH2C` is set.

KEV CVEs, unique (Grype's data and CISA's feed agree): **A**: CVE-2023-44487, CVE-2023-4911, CVE-2025-48384. **B**: CVE-2023-44487.

**Surprises.** Surprise 15 is resolved (Grype matches Go vulnerabilities by function on binaries). Three new ones, added to the list at the top: 17 (the guide's claim about Grype's standard-library source is out of date), 18 (Rapid Reset has two IDs), 19 (the HTTP/2 flaws are reachable in code but not exposed).

**Findings.** Two new rows: F16 (A's three KEV CVEs; B removed two) and F17 (B's top risks: the HTTP/2 denial-of-service family, then Go 1.18's Criticals).

**Decisions.**
- **Grype on the binary stays the primary count.** It's the more precise one for Go, because it checks for the vulnerable function. The report says why Trivy's number is higher instead of averaging or picking.
- **Rank by exploitation, not severity.** KEV first, then whether the vulnerable code is in the binary, then EPSS, then CVSS. That puts a Medium (Rapid Reset, actively exploited) above two Criticals (EPSS about 2%).
- **"In binary", "called" and "exposed" are three different claims,** each with its own evidence. None of them makes a vulnerability safe to keep.

**Evidence.** `reports/before/cisa-kev.json`, `govulncheck-*.json`, `logs/10-triage.log`, `tools/gap-analysis.sh`, `tools/triage.sh` and the five screenshots.


**Checkpoint 2 (after step 10).** Images A and B are complete: built, checked, scanned with two scanners, and triaged. The study guide was corrected in eight places to match what the lab measured: image sizes (surprises 6 and 11), the standard-library count in A (13), Grype's data source and function-level matching for Go (15, 17), Trivy and the kernel headers (14), Rapid Reset's two IDs and its exposure (18, 19), the container DNS fix (9), and SARIF and `trivy convert` in the scan commands.

---

## Step 11 · Image C: the runtime base becomes `cgr.dev/chainguard/static`
**Guide:** Chapter 8 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/11-image-c.log
**Screenshots:** demo/screenshots/11-image-c-base-verified.png, 11-image-c-diff-b-c.png, 11-image-c-build.png, 11-image-c-binary-sizes.png, 11-image-c-run-checks.png, 11-image-c-inside.png, 11-image-c-compare-abc.png

**Goal.** Change one thing: B's runtime base becomes Chainguard's `static`, pinned by digest and verified, while the build stage (and so the binary) stays the same.

**What we did.**
- Looked up the digest of `cgr.dev/chainguard/static:latest` with `crane digest` and listed its platforms.
- Verified Chainguard's signature on that digest with cosign, requiring the signer `chainguard-images/images/.github/workflows/release.yaml@refs/heads/main` and GitHub's OIDC issuer.
- Wrote `dockerfiles/Dockerfile.c-chainguard`: B's file with the runtime `FROM` changed to the pinned digest. Showed the one-line difference with `diff` (comment lines removed).
- Built it: the build stage came from the cache; the base was one layer.
- Copied the binary out of A and C and compared SHA-256 with B's.
- Ran the checks on port 8082: `curl`, the image's user, `id` and a shell inside (both fail), the real UID and GID with `ps` on the VM, `/etc/passwd`, and every file in the image (`docker export`).
- Scanned C with Grype and Trivy (same databases as B), listed its OS packages with Syft, and compared A, B and C.

**What came out.**

| Check | Result |
|---|---|
| Base digest | `cgr.dev/chainguard/static:latest@sha256:fc42af33e643f20d08baf03cddcc1c02ba57052dfb02edb0d79f3fc47bcea8d9`, an OCI index for `linux/amd64` and `linux/arm64` |
| Signature | Valid; recorded in the transparency log (verified offline); certificate chained to Sigstore's authority. Signer: Chainguard's `release.yaml` on `main`; issuer GitHub Actions |
| Dockerfile B → C | One instruction changed: line 9, the runtime `FROM` |
| Build | Build stage `CACHED`; base: one 459.89 kB compressed layer. Index `4f75bad2…` with an attestation manifest (default provenance) |
| The binary in A, B and C | Identical: SHA-256 `ec6fa6de2be34bc33430a8a922239c94a7c4a324a11371b5f347b6514bd7ca7f` |
| Size of `hello:c` | **19 MB** on disk; **5.62 MB** compressed (B: 155 MB and 35.4 MB; A: 1.49 GB and 374 MB) |
| `curl localhost:8082` | **Hello World!** |
| User | Image config `65532`. `ps` on the VM: **UID 65532, GID 65532**. `/etc/passwd`: `nonroot:x:65532:65532:Account created by apko` |
| `id` and a shell inside | Both fail: `exec: "id"` / `exec: "sh": executable file not found in $PATH` (exit code 127) |
| Contents | 1,254 files: 1,201 time-zone files, the package database, CA certificates, Wolfi's signing keys, our binary |
| OS packages (Syft) | `ca-certificates-bundle 20261020-r0`, `tzdata 2026f-r0`, `wolfi-baselayout 20230201-r31` |
| Grype, unique IDs | **69**: Critical 5, High 36, Medium 26, Low 1, Unknown 1. OS **0**; Go standard library **60**; Go modules **17**; all fixable |
| Trivy, unique IDs | **157**: OS **0** (Wolfi, 3 packages); standard library 104; modules 64; all fixable |

| Grype, unique IDs by layer | A | B | C |
|---|---|---|---|
| 1. OS packages | 603 | 92 | **0** |
| 2. Build tools (the Go toolchain as a program) | 118 | — | — |
| 3. Go standard library (on the app binary) | 60 | 60 | **60** |
| 4. Go modules | 17 | 17 | **17** |
| **Total** | **734** | **161** | **69** |

**Surprises.** None. Everything matched the guide's predictions, including the one-line difference and the identical binary.

**Findings.** One new row: F18 (no OS CVEs and no shell; the app's 69 remain). F11, F12 and F13 are now fixed.

**Decisions.**
- **Pin by digest and verify before building.** Chainguard's free images only offer `latest`; the digest makes the build reproducible, and the signature proves the base came from Chainguard's release pipeline.
- **Keep the old build stage in C.** The Go version doesn't change at the same time, so every CVE that disappears is the base image's, and every one that stays is the app's.
- **The optional "patch instead of switch" experiment** (an `apt-get upgrade` on image A) wasn't run, to save time.

**Evidence.** `reports/after/c-*` and `scanner-versions.txt`, `logs/11-image-c.log` and the seven screenshots.

---

## Step 12 · Does today's Go build the untouched 2021 code?
**Guide:** Chapter 9 (first check) · **Run in:** the tmux session `lab` on the VM · **Log:** logs/12-newgo.log
**Screenshots:** demo/screenshots/12-newgo-build-run.png, 12-newgo-compare.png

**Goal.** Before patching anything, find out whether a newer compiler alone can build the original code, and measure what a compiler upgrade alone changes.

**What we did.**
- Built `go/`, unchanged, with the VM's Go 1.27.4 into `hello-server-newgo` (outside `go/`), and checked that `git status go/` showed no changes.
- Ran it and `curl`ed it, then stopped it.
- Compared it with the Go 1.18 binary: the Go version, and the modules compiled in.
- Scanned the new binary with Grype (`file:`) and govulncheck (binary mode), and compared with the Go 1.18 build.
- Found which module CVE dropped and why.

**What came out.**

| | Go 1.18.10 binary (A, B, C) | Go 1.27.4 binary (same code, same `go.mod`) |
|---|---|---|
| Builds? | yes | **yes** (exit 0; `go/` unchanged) |
| Runs and answers `curl`? | yes | **yes**: Hello World!, with the same Gin warnings |
| Size | 9,761,868 bytes | 11,734,358 bytes (+20%) |
| Modules compiled in | 15 | the same 15, same versions (`diff` of the `dep` lines: identical) |
| Grype: standard library / modules / total | 60 / 17 / 69 | **0 / 16 / 16** |
| govulncheck (binary): reachable | 62 (2 modules + stdlib) | **11** (1 module: `x/net`) |

**Surprises.** One, added to the list at the top (20): a newer compiler also removed one module CVE (`x/text`'s CVE-2021-38561), because it no longer links the vulnerable function.

**Findings.** One new row: F19 (a compiler upgrade alone removes every standard-library CVE). F4 now notes the code builds unchanged on a current Go.

**Decisions.**
- **The toolchain and dependency upgrades can be separated.** The old code compiles on a current Go, so the compiler upgrade isn't blocked by the dependencies. Image D still does both at once; this binary is the measurement of the compiler part alone (the guide's optional "split D" experiment, done on the binary instead of a separate image).

**Evidence.** `reports/after/newgo-binary-grype.*`, `reports/after/govulncheck-binary-newgo.txt`, `logs/12-newgo.log` and the two screenshots.

---

## Step 13 · Image D: the patched app, built with a current Go
**Guide:** Chapter 9 (and Chapter 10's checks) · **Run in:** the tmux session `lab` on the VM · **Log:** logs/13-image-d.log (and logs/13-image-d-mac.log for the files written on the Mac)
**Screenshots:** demo/screenshots/13-image-d-go-get.png, 13-image-d-gomod-diff.png, 13-image-d-gomod-table.png, 13-image-d-why-modules.png, 13-image-d-main-go-diff.png, 13-image-d-govulncheck-build.png, 13-image-d-local-run-modes.png, 13-image-d-proxy-timeout-proof.png, 13-image-d-builder-verified.png, 13-image-d-diff-c-d.png, 13-image-d-build.png, 13-image-d-run-checks.png, 13-image-d-binary-modules.png, 13-image-d-scan-coverage.png, 13-image-d-trivy-clean.png, 13-image-d-compare-abcd.png, 13-image-d-golang-builder.png, 13-image-d-builders.png, 13-image-d-builder-kev.png

**Goal.** Fix the app itself: update its dependencies, fix the three code and configuration issues no scanner reports (F1, F2, F8), and build it with a current Go, on C's runtime base.

**What we did.**
- In `go-patched/` (an exact copy of `go/`, checked with `diff -r`): `go get -u ./...` and `go mod tidy` with the VM's Go 1.27.4. Showed the `go.mod` diff, a before/after table of every required module, which module set the new `go` line (`go mod graph`), and why each new module is there (`go mod why -m`).
- Patched `main.go` (written on the Mac, copied to the VM): `SetTrustedProxies(nil)`, and an `http.Server` with `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 10 s and `IdleTimeout` 60 s instead of `r.Run()`. Checked it with `gofmt -l` and `go vet`.
- Ran govulncheck on the patched source, built it locally, and ran it with and without `GIN_MODE=release`.
- Tested both code fixes against the original binary (`hello-server-b`, the one in A, B and C): a request with a forged `X-Forwarded-For`, and a connection that sends half a request header and never finishes it.
- Pinned `cgr.dev/chainguard/go:latest` by digest, verified Chainguard's signature, and read its config and Go version.
- Wrote `dockerfiles/Dockerfile.d-patched`: C's file with the builder changed to the pinned `chainguard/go`, plus `ENV GOTOOLCHAIN=local` and `ENV GIN_MODE=release`. Built it from `./go-patched`.
- Ran D on port 8083 and checked it: `curl`, user, no `id` or shell inside, the real UID and GID with `ps`, the container log, and both code fixes again, against the container.
- Copied D's binary out and compared its Go version and compiled-in modules with B's.
- Scanned D with Grype, Trivy and govulncheck, with database updates switched off so D is compared on the same databases as A, B and C. Checked that the scanners saw D's packages. Compared A, B, C and D.
- **Optional experiment:** built D a second time with Docker's official `golang:latest` as the builder (`dockerfiles/Dockerfile.d-golang`, only the builder `FROM` differs), compared the two binaries, scanned both final images and both builders, and checked the builders' CVEs against CISA's KEV list.

**What came out.**

| Check | Result |
|---|---|
| `go get -u ./...`, `go mod tidy` | No errors. **Nothing broke**, here or later in the build |
| `go` line | 1.18 → **1.26.10**, set by `gin-contrib/sse` v1.2.1 (surprise 21) |
| Modules required in `go.mod` | 19 → **30**: 16 updated, 2 unchanged (`json-iterator/go`, `modern-go/reflect2`), 12 added, 1 removed (`gopkg.in/yaml.v2`); `go.sum` 86 → 90 lines |
| Key versions | Gin v1.8.1 → **v1.12.0**; `x/net` 2021-02 snapshot → **v0.62.0**; `x/crypto` 2021-07 snapshot → v0.59.0; `x/sys` → v0.50.0; `x/text` v0.3.6 → v0.44.0; `protobuf` v1.28.0 → v1.36.12 |
| `main.go` | 1 line removed (`r.Run()`), 17 added (15 lines → 31); `gofmt -l`: nothing to format; `go vet`: no issues |
| govulncheck, source mode | **No vulnerabilities found** |
| Local build | Exit 0; 20,222,940 bytes |
| Run without `GIN_MODE` | Debug warnings, but no "trusted all proxies" warning: Gin printed it from `r.Run()`, which the code no longer calls |
| Run with `GIN_MODE=release` | Only the request log line; no `[GIN-debug]` lines |
| Forged `X-Forwarded-For: 203.0.113.9` | Original binary logs the client as **203.0.113.9**; patched logs `::1` (the real source) |
| Half-sent request header | Original: **still open after 15 s** (we gave up); patched: **closed after 5 s** |
| Builder | `cgr.dev/chainguard/go:latest@sha256:64c93a14feeb5320f251691bab838fd580721f45cb090697a5c1b0a482e503cb`, an OCI index for `linux/amd64` and `linux/arm64`; created 2026-11-15T22:10:17Z |
| Builder signature | Valid; transparency log checked offline; signer Chainguard's `release.yaml` on `main`, issuer GitHub Actions |
| Builder config | Go **1.27.4**; user 0 (root); entrypoint `/usr/bin/go`; `GOTOOLCHAIN=local+auto` (as the guide says) |
| Dockerfile C → D | Three instruction lines: the builder `FROM`, `ENV GOTOOLCHAIN=local`, `ENV GIN_MODE=release` |
| Build | `go mod download` 3.2 s, `go build` 9.6 s; runtime base `CACHED`; index `c5ce9ddb…` with an attestation manifest |
| Size of `hello:d` | **34.9 MB** on disk, **11 MB** compressed (C: 19 MB and 5.62 MB). Bigger, because the binary is (surprise 22) |
| `curl localhost:8083` | **Hello World!** |
| User | Image config `65532`; `ps` on the VM: **UID 65532, GID 65532** |
| `id` and a shell inside | Both fail: executable file not found |
| Container log | Only `[GIN]` request lines (release mode). The forged request is logged from **172.17.0.1** (Docker's bridge), not 203.0.113.9 |
| Half-sent header against the container | Closed after **5 s** |
| The binary in D | Go 1.27.4; 20,222,796 bytes; **19** modules compiled in (B and C: 15). Added: `quic-go`, `qpack`, `mongo-driver/v2`, `goccy/go-yaml`, `gabriel-vasile/mimetype`. Gone: `gopkg.in/yaml.v2` |
| Grype, unique IDs | **0** |
| Trivy, unique IDs | **0**: both targets (Wolfi, 3 packages; the Go binary, 21 packages) "Clean" |
| govulncheck, binary mode | **No vulnerabilities found** |
| What the scanners saw | Syft: 3 apk + 21 Go packages (19 modules, the standard library, the app). Grype: source `hello:d`, distro Wolfi. Trivy: 3 + 21 packages scanned |
| Databases | Grype schema v6.1.10 built 2026-11-16T06:30:54Z; Trivy updated 2026-11-16 07:10:39 UTC: the same as for A, B and C (updates off) |

| | A | B | C | D |
|---|---|---|---|---|
| Size on disk / compressed | 1.49 GB / 374 MB | 155 MB / 35.4 MB | 19 MB / 5.62 MB | **34.9 MB / 11 MB** |
| Packages | 201 deb | 78 deb | 3 apk | **3 apk** |
| User | 0:0 | 65532:0 | 65532:65532 | **65532:65532** |
| Shell | yes | yes | no | **no** |
| Grype, unique IDs | 734 | 161 | 69 | **0** |
| Trivy, unique IDs | 10,856 | 253 | 157 | **0** |

| Grype, unique IDs by layer | A | B | C | D |
|---|---|---|---|---|
| 1. OS packages | 603 | 92 | 0 | **0** |
| 2. Build tools (the Go toolchain as a program) | 118 | — | — | — |
| 3. Go standard library (on the app binary) | 60 | 60 | 60 | **0** |
| 4. Go modules | 17 | 17 | 17 | **0** |
| **Total** | **734** | **161** | **69** | **0** |

**Optional experiment: does the builder's brand matter?**

| | `chainguard/go` (image D) | `golang:latest` (image D-golang) |
|---|---|---|
| Digest | `64c93a14…03cb` (signature verified) | `fe517aca…47a1` (pinned, not signature-verified) |
| Created | 2026-11-15 | 2026-11-10 |
| Go | 1.27.4 | 1.27.4 |
| `GOTOOLCHAIN` in the image | `local+auto` (our Dockerfile sets `local`) | `local` |
| Final image: Grype | **0** | **0** |
| The binary | 20,222,796 bytes; build info identical except `chainguard_go_package=go-1.27-1.27.4-r0` (surprise 24) | 20,222,668 bytes |
| **The builder itself: Grype** | **0** | **325** (Critical 10, High 68, Medium 73, Low 21, Negligible 140, Unknown 13), all in Debian packages; **1 on KEV** (CVE-2026-123158, `openssh-client`, surprise 25) |
| Builder size, disk / compressed | 1.08 GB / 253 MB | 1.32 GB / 320 MB |
| Builder packages (Syft) | 66 apk | 208 deb (+1 binary, 1 Python) |
| Builder user, shell | root, yes | root, yes |
| Of our ten tools | go, gcc, git, make, ssh | all ten (adds curl, wget, apt-get, perl, python3) |

**Surprises.** Seven, added to the list at the top (21–27): the `go` line set by a small helper library; new Gin making the binary bigger; the proxy fix being provable after all; Chainguard's Go stamping its package into the binary; a KEV-listed CVE that Debian rates Negligible in the official Go builder; an empty Trivy table; and the guide's builder figures.

**Findings.** Three new rows: F20 (D has no known vulnerabilities), F21 (the update widened the supply chain), F22 (the builder decides the build environment's risk, not what ships). F1, F2 and F8 are fixed and tested; F3, F4, F6 and F14–F19 are done in D.

**Decisions.**
- **Update everything at once (`go get -u ./...`).** For a 15-line app the test is a `curl`, and nothing broke. For a real service I'd update in smaller steps, starting with the modules that carry the CVEs.
- **Test the code fixes, don't just apply them.** Both were shown failing on the original binary and holding on D, locally and in the container.
- **Builder pinned and verified like the runtime base**, with `GOTOOLCHAIN=local`, so the build uses the image's own compiler or fails.
- **Scanner databases frozen for D's scans** (`GRYPE_DB_AUTO_UPDATE=false`, Trivy `--skip-db-update`), so A to D compare on the same data. Step 14 rescans everything on fresh databases.
- **Ran the optional builder experiment.** It answers "wouldn't `golang:latest` do the same?" with measurements: yes for what ships, no for the build environment.

**For the guide (checkpoint 3).** The proxy fix can be shown from the request log (surprise 23); the `go` line moves to 1.26.10 because of `gin-contrib/sse` (21); `chainguard/go` has 66 packages, `golang:latest` is Go 1.27.4 at 320 MB with 208 packages (27); the builders' CVE counts and the KEV finding (25) belong in the "Wouldn't `golang:latest` do the same?" answer; image D's sizes and counts go into Chapter 10.

**Evidence.** `go-patched/` (go.mod, go.sum, main.go), `dockerfiles/Dockerfile.d-patched`, `dockerfiles/Dockerfile.d-golang`, `reports/after/d-*`, `d-golang-grype.json`, `builder-*-grype.json`, `govulncheck-source-d.txt`, `govulncheck-binary-d.txt`, `scanner-versions.txt`, `logs/13-image-d.log` and the nineteen screenshots.

---

## Step 14 · Prove the result: the same-day rescan of all four images
**Guide:** Chapter 10 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/14-final.log (and logs/14-final-mac.log for the files written on the Mac)
**Screenshots:** demo/screenshots/14-final-results-table.png, 14-final-results-view.png, 14-final-d-no-shell.png

**Goal.** One fair table: all four images rescanned on the same day with the same databases, every number generated from the saved reports, and proof that D works, runs as non-root and has no shell.

**What we did.**
- Refreshed both scanner databases (`grype db update`, `trivy image --download-db-only`) and recorded the before and after dates.
- Downloaded CISA's KEV catalog again, and recorded the scanner versions twice: `reports/final/scanner-versions.txt` for people, `reports/final/scanners.json` for the script.
- Rescanned A, B, C and D with Grype (JSON, table, SARIF) and Trivy (JSON, then table and SARIF with `trivy convert`), with Grype's update check off so all four use one database; ran govulncheck in binary mode on the two distinct app binaries (A, B and C ship the same one, SHA-256 `ec6fa6de…`; D's is `00aee679…`).
- Gzipped image A's three largest reports, as at step 09 (the originals stay on the VM, ignored by git).
- Wrote `tools/results.sh` (on the Mac, copied to the VM): it reads `reports/final/`, starts each image to check what it really runs as, whether it has a shell and whether it answers, and writes `results.json` and `reports/final/comparison.md`. Ran it, then showed the same numbers as an aligned table for the deck.
- Proved D has no shell from its filesystem: the configured user, `sh` as the entrypoint, and every file in the image searched for a shell, BusyBox or a package manager.
- Renamed the challenge brief from `README.md` to `CHALLENGE.md` (`git mv`, history kept) and wrote a new `README.md` as the repo's front page, with the generated tables. Filled in REPORT.md §1, §7 and §8, confirmed §3, replaced §4's tables with the generated ones and added the rescan to §5.

**What came out.**

| Check | Result |
|---|---|
| Database update | None available: Grype's database stays the one built 2026-11-16T06:30:54Z, Trivy's the one updated 07:10:39 UTC. Every scan in the lab used these two |
| CISA KEV catalog | 2026.11.13 (released 2026-11-13 20:24 UTC), 1,781 entries: the same catalog as at step 10 |
| Rescan | 13:46 UTC, about 40 seconds for all four (databases and layers cached) |
| Counts | Identical to the first scans: Grype **734 / 161 / 69 / 0**, Trivy **10,856 / 253 / 157 / 0** |
| On KEV | A 3 (CVE-2023-44487, CVE-2023-4911, CVE-2025-48384); B 1 and C 1 (CVE-2023-44487); D 0 |
| govulncheck, binary mode | 62 in the binary A, B and C ship; 0 in D's |
| Fixable (Grype) | A 374, B 72, C 69, D 0 |
| Runs as (`ps` on the VM) | A 0:0, B 65532:0, C 65532:65532, D 65532:65532 |
| Shell (`sh` as the entrypoint) | A yes, B yes, C no, D no |
| "Hello World!" | All four |
| D's filesystem | 1,254 files, 1,201 of them time-zone data. No `sh`, `bash`, `ash`, `busybox`, `apk`, `dpkg` or `apt` anywhere; `sh` as the entrypoint fails with exit code 127. Present: the app, CA certificates, Wolfi's package database and signing keys, `/etc/apko.json`, and an SPDX SBOM for each package (surprise 28) |

The generated table (`reports/final/comparison.md`, also in README.md and REPORT.md §4):

| Image | Build stage | Runtime base | Size on disk (compressed) | OS packages | Go modules in the binary | Critical | High | Unique CVEs: Grype (Trivy) | On KEV | govulncheck | Runs as | Shell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | `golang:1.18` | (same image) | 1.49 GB (374 MB) | 201 Debian | 15 (Go 1.18.10) | 46 | 225 | **734** (10,856) | 3 | 62 | root (0:0) | yes |
| B | `golang:1.18` | `debian:trixie-slim` | 155 MB (35.4 MB) | 78 Debian | 15 (Go 1.18.10) | 5 | 55 | **161** (253) | 1 | 62 | 65532:0 | yes |
| C | `golang:1.18` | `cgr.dev/chainguard/static` | 19 MB (5.62 MB) | 3 Wolfi | 15 (Go 1.18.10) | 5 | 36 | **69** (157) | 1 | 62 | 65532:65532 | no |
| D | `cgr.dev/chainguard/go` | `cgr.dev/chainguard/static` | 34.9 MB (11 MB) | 3 Wolfi | 19 (Go 1.27.4) | 0 | 0 | **0** (0) | 0 | 0 | 65532:65532 | no |

**Surprises.** One, added to the list at the top (28): D ships an SBOM for each of its packages inside the image. Surprise 26 also got a better fix: `trivy convert --scanners vuln`.

**Findings.** F20 confirmed by the rescan and the filesystem check. No new findings.

**Decisions.**
- **Every number comes from a script.** `tools/results.sh` writes `results.json` and the tables from the saved reports and from live checks of each image; README.md and REPORT.md §4 embed its output instead of retyped numbers.
- **The brief becomes `CHALLENGE.md`.** The repo's `README.md` was the challenge brief; it's renamed with `git mv` so its content and history stay, and `README.md` becomes the front page.
- **Same databases everywhere.** No newer database was published during the lab day, so before, after and final all compare on identical data.

**Evidence.** `reports/final/` (all four images in JSON, SARIF and table form, with image A's largest files gzipped; govulncheck; the KEV catalog; `scanner-versions.txt`; `scanners.json`; `comparison.md`), `results.json`, `tools/results.sh`, `logs/14-final.log` and the three screenshots.

**Checkpoint 3 (after step 14).** The core lab is complete: four images built, run, scanned on the same day with the same databases, triaged and fixed, with every deliverable the brief asks for in the repo and `README.md` as its front page. The study guide was corrected to match steps 13 and 14: the `go` line and who sets it (surprise 21); what the update added to the binary (22); testing the proxy and timeout fixes instead of pointing at the code (23); the builders' measured contents and CVEs, the KEV entry in `golang:latest` and the D-golang result (24, 25, 27); the result of the first build with today's Go; `trivy convert --scanners vuln` (26); Chapter 10's table with the lab's numbers, generated by `tools/results.sh`, with one database for all four; how the zero in D was checked; the no-shell proof; the SBOMs inside Chainguard's images (28); and the repo layout.

---

## Step 15 · SBOMs for all four images
**Guide:** Chapter 11 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/15-sbom.log
**Screenshots:** demo/screenshots/15-sbom-generated.png, 15-sbom-a-other-ecosystems.png, 15-sbom-scan-counts.png, 15-sbom-scan-matches-trivy.png, 15-sbom-chainguard-verified.png, 15-sbom-three-way.png

**Goal.** An SBOM for each image (the brief's bonus), then two checks: does scanning the SBOM give the same answer as scanning the image, and how does Chainguard's own SBOM compare with ours?

**What we did.**
- Generated an SPDX 2.3 and a CycloneDX SBOM for each image with Syft (one run, two outputs) into `sbom/`, and counted the packages by type (package URL).
- Looked at the entries in A's SBOM that are neither Debian nor Go.
- Scanned each SPDX SBOM with Grype (`grype sbom:…`, the same database as step 14, update check off), and C's CycloneDX SBOM too, into `reports/sbom/`; compared with the step 14 image scans layer by layer.
- Compared C's SBOM-based Go IDs with Trivy's image scan, and checked whether the SBOM carries symbol data.
- Verified Chainguard's signed SBOM attestation for the `static` arm64 image our C and D build on (`cosign verify-attestation`, the same identity and issuer as step 11) and saved it as `sbom/chainguard-static-arm64.spdx.json`.
- Copied the 3 SBOMs out of image D (`/var/lib/db/sbom/`) into `sbom/inside-image-d/`, and compared all three SBOMs.

**What came out.**

| Image | SPDX packages | By package URL type | Grype from the image | Grype from the SBOM |
|---|---|---|---|---|
| A | 260 | deb 201, golang 55, generic 1 (the Go toolchain), npm 1, pypi 1, oci 1 | 734 | 780 |
| B | 96 | deb 78, golang 17, oci 1 | 161 | 250 |
| C | 21 | apk 3, golang 17 (15 modules, the standard library, the app), oci 1 | 69 | 158 (CycloneDX: 158) |
| D | 25 | apk 3, golang 21 (19 modules, the standard library, the app), oci 1 | 0 | 0 |

| Check | Result |
|---|---|
| By layer, C | Image: modules 17, standard library 60. SBOM: modules **65**, standard library **104**. OS layers identical in A (603) and B (92) |
| C's SBOM-based Go IDs vs Trivy's image scan | 157 in common; one extra, CVE-2023-44487 (Rapid Reset's KEV ID; Trivy files it as CVE-2023-39325); none of the image scan's 69 missing |
| Symbol data in the SBOM | None: a Go package entry has name, version, checksums, licences, supplier and package URL; "symbol" appears 0 times |
| A's other ecosystems | Mercurial 5.6.1 (Python), `d3-pprof` 2.0.0 (an npm manifest in Go's pprof sources), the Go toolchain (generic) |
| Chainguard's SBOM attestation | Verified: Chainguard's `release.yaml` on `main`, GitHub Actions issuer, transparency log checked offline. Subject: `cgr.dev/chainguard/static@sha256:8f9c7533c770…` (the arm64 image in the index C and D pin). SPDX 2.3, by apko v1.2.28 and Chainguard, Inc.; 17 entries |
| Three SBOMs compared | Chainguard's, the 3 inside image D, and ours all list `ca-certificates-bundle` 20261020-r0, `tzdata` 2026f-r0 and `wolfi-baselayout` 20230201-r31. Chainguard's and the in-image ones also name each package's build file (`chainguard-dev/stereo` at a commit) and upstream source (`eggert/tz` 2026f, `alpine/ca-certificates` 20261020). Only ours has the app: 21 Go packages |
| Sizes | SPDX: A 10.5 MB, B 2.1 MB, C 0.9 MB, D 0.9 MB. A's SBOM-scan report (54 MB) is committed gzipped |

**Surprises.** Three, added to the list at the top (29–31): the SBOM scan's higher count, A's Python and npm entries, and how much more Chainguard's SBOM records.

**Findings.** One new row: F23 (for Go, an SBOM-based scan reports module-level risk).

**Decisions.**
- **SPDX and CycloneDX both.** One Syft run writes both; customers ask for one or the other, and Grype reads either with the same result.
- **Verify, then read.** Chainguard's SBOM was taken from `cosign verify-attestation`, which checks the signature before handing over the content, rather than an unverified download.
- **Counts stay image-based.** The SBOM scans are kept in `reports/sbom/` to show the difference; the report's numbers remain the image scans.

**Evidence.** `sbom/` (8 SBOMs for A to D, Chainguard's signed SBOM, the 3 from inside image D), `reports/sbom/`, `logs/15-sbom.log` and the six screenshots.

---

## Step 16 · A local registry, with C and D pushed
**Guide:** Chapter 11 · **Run in:** the tmux session `lab` on the VM · **Log:** logs/16-registry.log
**Screenshots:** demo/screenshots/16-registry-running.png, 16-registry-2-vs-3.png, 16-registry3-running.png, 16-registry-pushed.png, 16-registry-provenance-deps.png, 16-registry-provenance-commit.png, 16-registry-roundtrip.png

**Goal.** A registry for the signing and Kubernetes steps: push C and D, record their digests, and find out whether Docker attached its default provenance (the guide's open question).

**What we did.**
- Pinned `registry:2` by digest, read its config, started it on port 5000 and checked its API. Then checked its version and scanned it, and scanned `registry:3` for comparison; looked for Chainguard's registry image.
- Replaced the (still empty) `registry:2` container with `registry:3`, pinned by digest, and checked it answers on the VM's network address as well (the k3s VM will pull from there at step 18).
- Tagged and pushed C and D; compared each registry digest with the local image ID.
- Read D's index in the registry, its attestation manifest, and the provenance statement itself (`crane blob`), saved as `reports/provenance/d-buildkit-provenance.json`.
- Checked the provenance's commit against git.
- Validated every blob of D in the registry (`crane validate --remote`) and ran D from the registry by digest.

**What came out.**

| Check | Result |
|---|---|
| `registry:2` | `registry@sha256:a3d8aaa63ed8…`, built 2023-10-02, distribution 2.8.3, root; Grype **72** (Critical 4, High 31, Medium 33, Low 3, Unknown 1; standard library 66, apk 6) |
| `registry:3` | `registry@sha256:82f6ff4a7f98…`, built 2026-11-05, distribution 3.1.2, root; Grype **22** (Critical 2, High 11, Medium 7, Low 1, Unknown 1; modules 11, standard library 14, apk 2) |
| Chainguard's registry image | `cgr.dev/chainguard/registry` and `…/distribution`: FORBIDDEN without an account |
| Registry in use | `registry:3`, port 5000, `--restart unless-stopped`; HTTP 200 on `localhost:5000/v2/` and on `192.168.252.2:5000/v2/` |
| Pushed | `hello:c` and `hello:d`; catalog `hello`, tags `c` and `d` |
| Digests | C `sha256:4f75bad2…a23141` and D `sha256:c5ce9ddb…270a08`: registry digest = local image ID for both |
| D's index | OCI image index: the `linux/arm64` image `712af371…` and an `attestation-manifest` (`da9c4509…`) that refers to it |
| The attestation | One in-toto layer, predicate type `https://slsa.dev/provenance/v1`, 1,979 bytes; no signature |
| What it records | Both base images by digest, matching the Dockerfile pins; the Dockerfile path; the git repository and commit (`ca39930`); BuildKit's Dockerfile frontend version (1.28.0); start and finish times. Builder ID: empty |
| The commit | At `ca39930`, `go-patched/` has Gin v1.8.1 and no `SetTrustedProxies`; the patched code is in `cac3592`, committed at 17:40, about 12 minutes after the build finished at 17:28 (VM time). No dirty-tree marker |
| `crane validate --remote` on D | PASS |
| D run from the registry by digest | Hello World!, as 65532:65532 |

**Surprises.** Three, added to the list at the top (32–34): the frozen `registry:2` tag, the default provenance's contents, and its commit pointing at the wrong code.

**Findings.** Two new rows: F24 (D's provenance doesn't prove how D was built) and F25 (the registry is lab-grade).

**Decisions.**
- **`registry:3` instead of `registry:2`,** pinned, before anything was pushed. Same reasoning as the rest of the lab: a frozen tag carries years of CVEs.
- **Keep the default provenance.** It's honest evidence of a Level 1 build and records the pinned bases; D is signed by its index digest in step 17, which covers the provenance too.
- **Don't rebuild D** to fix the commit in its provenance: the image's digest would change after the step 14 evidence. The lesson goes to the CI step instead.
- **The registry listens on the VM's network,** without TLS or authentication, so the k3s VM can pull from it; acceptable on a private Multipass network only.

**Evidence.** `reports/after/registry2-grype.json`, `reports/after/registry3-grype.json`, `reports/provenance/d-buildkit-provenance.json`, `logs/16-registry.log` and the seven screenshots.

---

## Step 17 · Sign image D and verify it
**Guide:** Chapter 11 · **Run in:** the tmux session `lab` on the VM; the key's password was typed at the prompt each time, never shown or logged · **Log:** logs/17-sign.log
**Screenshots:** demo/screenshots/17-sign-keypair.png, 17-sign-storage.png, 17-verify-pass-fail.png, 17-verify-tlog-warning.png, 17-attest-sbom-verified.png

**Goal.** Sign D by digest with our own key, prove verification passes for D and fails where it should, and attach a signed SBOM the way Chainguard does for its images.

**What we did.**
- Made a folder for the key outside the repo (`~/cosign-lab`, mode 700) and checked that git ignores `*.key` as a second guard.
- Generated the key pair with `cosign generate-key-pair` (password typed at the prompt, twice). Recorded the file permissions, the private key's first line only, and the public key with its fingerprint; copied the public key into the repo as `cosign.pub`.
- Signed D by digest with `--use-signing-config=false --tlog-upload=false`, so nothing went to Sigstore's public transparency log.
- Found where the signature is stored: tags, the registry's referrers API, the fallback index and the signature manifest, and `cosign tree`.
- Verified three cases: D with our key, C (never signed) with our key, D with a throwaway key made for the test.
- Attached D's SPDX SBOM from step 15 as a signed attestation (`cosign attest --type spdxjson`), verified it, decoded it and compared it with the file; then asked for a provenance attestation that doesn't exist.
- Read cosign's full verification output, warnings included.
- Saved the evidence in `reports/signing/` and deleted the throwaway key.

**What came out.**

| Check | Result |
|---|---|
| cosign | v3.1.4 (built 2026-10-20) |
| Key pair | ECDSA P-256. Private key: `-----BEGIN ENCRYPTED SIGSTORE PRIVATE KEY-----`, mode 600, in `~/cosign-lab` (outside the repo, never copied to the Mac). Public key: `cosign.pub`, SHA-256 fingerprint (DER) `a1d685619f0ec2c150dd42245aad282cc5943021ceaa442621403a3d686a620a` |
| Signing D | `localhost:5000/hello@sha256:c5ce9ddb…270a08`; exit 0; both flags printed the deprecation warnings the guide predicted ("an offline signing flag will be added in the future") |
| Where the signature went | Referrers API: HTTP 404. New tag `sha256-c5ce9ddb…` → an OCI index → signature manifest `b413e1c9…` (artifact type `application/vnd.dev.sigstore.bundle.v0.3+json`, subject D, one 667-byte layer). D's own digest unchanged |
| Verify D, our key | **PASS**; the signed digest is D's |
| Verify C, our key | **FAIL**, exit 10: "no signatures found" |
| Verify D, another key | **FAIL**, exit 1: "accepted signatures do not match threshold, Found: 0" |
| SBOM attestation | First attempt: "decryption failed", a mistyped password, nothing written. Second: exit 0, attestation `db87215b…` |
| Verify the attestation | **PASS**. Predicate type `https://spdx.dev/Document`, subject D's digest, SPDX 2.3 with 25 packages, identical to `sbom/d.spdx.json` |
| Ask for provenance | **FAIL** as expected: "none of the attestations matched the predicate type" (only the signature and the SBOM are attached) |
| What's attached to D | `cosign tree`: the signature (`sigstore.dev/cosign/sign/v1`) and the SBOM (`spdx.dev/Document`), both via the referrers fallback |
| cosign's messages | "WARNING: Skipping tlog verification…", followed by a checklist that still claims a transparency-log check (surprise 36) |

**Surprises.** Two, added to the list at the top (35, 36): the referrers fallback on `registry:3`, and cosign's checklist contradicting its own warning. The guide's predictions about cosign v3's flags held exactly; it had only checked them in the source.

**Findings.** No new rows. The supply-chain row of REPORT §7 is updated: D is signed and carries a signed SBOM.

**Decisions.**
- **Key-based signing without the transparency log,** for a throwaway image on a private registry, as the guide argues. The cost: a verifier can't check when it was signed. In production: keyless signing from CI, logged.
- **The private key never enters the repo.** It lives in `~/cosign-lab` on the VM, protected by its password and by the folder's permissions; `.gitignore` refuses `*.key` as well.
- **C stays unsigned** on purpose, as the negative test.
- **Signing the index digest also seals Docker's provenance.** D's digest is the index's, and the index lists the attestation manifest by digest, so altering the provenance would change D's digest and break the signature. That protects it from tampering; it doesn't make it a trustworthy record of the build (F24).

**Evidence.** `cosign.pub`, `reports/signing/` (`d-verify.json`, `d-sbom-attestation-statement.json`, `d-cosign-tree.txt`, `d-referrers-fallback-index.json`), `logs/17-sign.log` and the five screenshots.

**Checkpoint 4 (after step 17).** The supply-chain bonus is done: SBOMs for every image (step 15), a local registry with C and D (16), and D signed with a signed SBOM attached (17). The study guide's Chapter 11 was corrected to match: scanning an SBOM isn't scanning the image (surprise 29); `registry:3` instead of the frozen `registry:2` (32); cosign v3's flags confirmed in practice, the checklist that contradicts its own warning (36), where the signature is stored without a referrers API (35), and the wrong-key test; verifying Chainguard's SBOM instead of downloading it, and what it contains (31); attaching our own SBOM; and Docker's default provenance as found in the lab, including its commit pointing at code that wasn't built (33, 34).

---

## Step 18 · The k3s VM: a small Kubernetes cluster that pulls from the lab registry
**Guide:** Chapter 12 · **Run from:** the Mac (creating and installing the VM: `multipass` can't be driven from the build VM), then the tmux session `lab` on the VM · **Logs:** logs/18-k3s-mac.log, logs/18-k3s.log
**Screenshots:** demo/screenshots/18-k3s-cluster.png, 18-k3s-pods-and-pull.png

**Goal.** A separate machine running Kubernetes that pulls images from the build VM's registry over the network, managed with `kubectl` from the build VM, as a pipeline would manage a remote cluster.

**What we did.**
- Checked k3s's release channels and pinned the version: stable and latest were both v1.37.2+k3s1, the same as the build VM's kubectl.
- Launched the VM from the Mac (2 CPUs, 3 GB, 15 GB disk).
- Checked that it reaches the registry, then wrote `/etc/rancher/k3s/registries.yaml` declaring the build VM's registry as plain HTTP, before installing k3s, so the first start reads it.
- Downloaded the k3s install script instead of piping it into a root shell, recorded its SHA-256, read how it verifies the binary, then ran it with `INSTALL_K3S_VERSION=v1.37.2+k3s1`.
- Waited for the node, then copied k3s's admin kubeconfig to the build VM (`~/.kube/config`, mode 600, server rewritten to the k3s VM's address) without printing it.
- Pulled D by digest into the cluster's container runtime (`crictl pull`), to prove `registries.yaml` works.
- From the build VM: `kubectl version`, the node, the system pods and the namespaces.

**What came out.**

| Check | Result |
|---|---|
| k3s versions | Channels stable and latest: v1.37.2+k3s1; kubectl on the build VM: v1.37.2. No version skew |
| The VM | `k3s`, 192.168.252.3 (the build VM is 192.168.252.2), Ubuntu 24.04.5, 2 CPUs, 2.9 GiB usable; launched in 79 s |
| Registry from the k3s VM | `{"repositories":["hello"]}` |
| `registries.yaml` | Mirror `192.168.252.2:5000` with endpoint `http://192.168.252.2:5000`, written before the install |
| Install script | `get.k3s.io`, 1,218 lines, SHA-256 `c2a2643d…fab9d`. It downloads `sha256sum-arm64.txt` from the same GitHub release as the binary and refuses a binary whose hash differs ("Verifying binary download" printed) |
| Install | v1.37.2+k3s1, exit 0, 7 s; the `kubectl`, `crictl` and `ctr` symlinks, and a systemd service |
| Node | `k3s Ready control-plane v1.37.2+k3s1`, containerd 2.3.7, kernel 6.8.0-147 (arm64) |
| kubeconfig on the build VM | `~/.kube/config`, mode 600, `server: https://192.168.252.3:6443`; not printed, outside the repo |
| `kubectl version` from the build VM | Client v1.37.2, server v1.37.2+k3s1 |
| Pull by digest in the cluster | `crictl pull 192.168.252.2:5000/hello@sha256:c5ce9ddb…`: exit 0; image ID `67d91c78701a…` (D's config digest from step 13), 11 MB |
| System pods | CoreDNS, Traefik and its service load balancer, metrics-server, the local-path provisioner; Helm jobs for Traefik and the Gateway API definitions (completed) |
| Pod Security labels | None on any namespace yet |

**Surprises.** None worth a row. The setup matched the guide, apart from the addresses (surprise 2: 192.168.252.x, not the guide's 192.168.64.x). Two observations: the VM launched in 79 s, against several minutes for the build VM's first boot (surprise 1), and this k3s release also installs the Gateway API definitions.

**Findings.** No new rows.

**Decisions.**
- **Pin k3s to v1.37.2+k3s1,** matching kubectl, instead of whatever the install script considers stable on the day.
- **Download, read, then run the install script.** Its checksum check guards against a corrupted or swapped download; the binary and its checksum come from the same GitHub release, so we still trust the k3s release itself.
- **The admin kubeconfig on the build VM** is the cluster's full admin credential: acceptable in a single-user lab, never printed or committed. In production a pipeline gets its own service account with only the permissions it needs.

**Evidence.** `logs/18-k3s-mac.log`, `logs/18-k3s.log` and the two screenshots.

---

## Step 19 · Deploy image D to the cluster
**Guide:** Chapter 12 · **Run in:** the tmux session `lab` on the VM (kubectl), plus two checks on the k3s node from the Mac · **Logs:** logs/19-deploy.log, logs/19-deploy-mac.log
**Screenshots:** demo/screenshots/19-restricted-rejects.png, 19-pods.png, 19-curl-noshell-heal.png, 19-runtime-applied.png, 19-unsigned-c-runs.png

**Goal.** Run D on the cluster by the digest that was scanned and signed, under Kubernetes' strictest built-in policy, and prove what that does and doesn't guarantee.

**What we did.**
- Wrote `k8s/deployment.yaml` and `k8s/service.yaml` from the guide (on the Mac, copied in), with D's digest at the registry's real address; added `runAsGroup: 65532` and `automountServiceAccountToken: false`.
- Validated them with a server-side dry run, then labelled the `default` namespace to enforce (and warn about) the restricted Pod Security level.
- Negative test: `kubectl run` of the same image with no security settings.
- Applied the manifests, waited for the rollout, and read the image digest each pod resolved.
- Reached the app with `kubectl port-forward` to the Service and `curl`; tried `kubectl exec` with a shell; read the pods' logs; deleted one pod and watched it come back.
- On the k3s node (from the Mac): the app processes' UID and GID, and the runtime spec of each container (`crictl inspect`).
- Deployed unsigned image C under another name with the same settings, checked it ran, and deleted it.

**What came out.**

| Check | Result |
|---|---|
| Server-side dry run | `deployment.apps/hello created (server dry run)`, `service/hello created (server dry run)` |
| Namespace | `default`: `pod-security.kubernetes.io/enforce=restricted` (and `warn=restricted`) |
| Negative test | **Forbidden**: "violates PodSecurity restricted:latest: allowPrivilegeEscalation != false, unrestricted capabilities, runAsNonRoot != true, seccompProfile"; no pod created |
| Rollout | `deployment "hello" successfully rolled out`; 2/2 ready; Service `hello`, ClusterIP 10.43.189.153, port 8080 |
| Pods | Two Running on node `k3s`, no restarts; both run `192.168.252.2:5000/hello@sha256:c5ce9ddb…270a08`, the digest scanned at step 14 and signed at step 17 |
| `curl` through `kubectl port-forward svc/hello 8085:8080` | **Hello World!** |
| `kubectl exec … sh` | Fails: `exec: "sh": executable file not found in $PATH` |
| Logs | Request lines only (release mode): the kubelet's readiness and liveness probes every 10 s from 10.42.0.1, and the port-forwarded request from 127.0.0.1 |
| Self-healing | One pod deleted; its replacement Running within 8 s |
| On the node | Both app processes run as **65532:65532**. Runtime spec of each container: read-only root `true`, `no_new_privileges` `true`, no capabilities, seccomp default action `SCMP_ACT_ERRNO`, memory limit 64 MiB, CPU quota 200m |
| Unsigned C | cosign: "no signatures found". Deployed as `hello-c` with the same settings: 2/2 Running on `hello@sha256:4f75bad2…`. Deleted afterwards |

**Surprises.** One, added to the list at the top (37): Pod Security refused the safe image when the pod didn't declare its settings.

**Findings.** One new row: F26 (the cluster doesn't check signatures).

**Decisions.**
- **The image by digest, never by tag,** so the cluster runs exactly the bytes that were scanned and signed.
- **Enforce `restricted` on the namespace,** and declare every setting in the manifest, including two the guide's version left out: `runAsGroup` and no service-account token.
- **Port 8085 for the port-forward,** so nothing on the build VM's 8080 gets in the way.
- **Prove the gap rather than describe it:** the unsigned C test turns "nothing checks the signature" from an admission into evidence, and points to the fix.

**Evidence.** `k8s/deployment.yaml`, `k8s/service.yaml`, `logs/19-deploy.log`, `logs/19-deploy-mac.log` and the five screenshots.

**Checkpoint 5 (after step 19).** The Kubernetes bonus is done: a k3s cluster on its own VM (step 18) runs image D by its signed digest under the restricted Pod Security level (19). The study guide's Chapter 12 was corrected to match: the lab's addresses; downloading the k3s install script and pinning the version that matches kubectl; what its checksum check does and doesn't protect against; proving the pull with `crictl` first; `runAsGroup` and no service-account token in the manifest; the warn label, the negative test (surprise 37) and a free port for the port-forward; checking what the node actually applied; and the unsigned-C test in the answers about signatures (F26).

---

## Step 20 · The pipeline: a gate, a self-hosted runner, signing and a signature policy
**Guide:** Chapter 14 · **Run in:** the tmux session `lab` on the VM (the runner in its own window, `runner`), the Mac for GitHub, and GitHub itself · **Logs:** logs/20-ci.log, logs/20-ci-mac.log
**Screenshots:** demo/screenshots/20-kyverno-signed-vs-unsigned.png, 20-runner-verified.png, 20-runner-registered.png, 20-requirements-cooldown.png, 20-gate-pass-local.png, 20-runner-picks-up-job.png, 20-pipeline-deployed-bypass-refused.png, 20-runner-gate-failed.png, 20-runner-gate-passed.png, 20-merge-deployed.png

**Goal.** The guide's pipeline, without the agent: a private repo, a seven-check gate run by a runner on the build VM, a deploy job that signs, and a cluster that only admits what was signed. Then a change that fails the gate, the fix that passes it, and the merge that deploys it.

**Your decisions before the step.** I create the private repo; the pipeline reuses the step 17 key; Kyverno v1.19.2, because v1.20.0 was only 4 days old and our own gate refuses anything newer than 7 days; 20 minutes for the signature policy before falling back to `deploy.sh`'s own check.

**What we did.**
- **Kyverno first, as the guide advises:** downloaded v1.19.2's install manifest, checked its images and its policy API, applied it, and tested a signature policy at once with existing images: D (signed) and C (unsigned). Then applied the final policy, which covers every image from the lab registry.
- Created the private repo `saadallahchebaro/hello-ai` (gh switched to the personal account for the step).
- Downloaded the runner (v2.338.2, arm64), checked its SHA-256 against the release notes, registered it with the token you pasted at a hidden prompt, and started it in the tmux window `runner`.
- The `COSIGN_PASSWORD` secret: added by you on GitHub's settings page, after the Terminal-panel prompt failed (surprise 41).
- Wrote the repo on the Mac: the FastAPI app, the Dockerfile on Chainguard's Python images pinned by digest, `gate.sh`, `deploy.sh` (key in `~/cosign-lab`, password from the secret), the manifests, the policy and two workflows with `actions/checkout` pinned by commit. Pinned all 14 Python packages with `ci/resolve.py`.
- Ran the gate by hand on the VM before pushing anything.
- Pushed the starting version: refused twice for the `workflow` scope (surprise 38); after you added it, pushed from the VM with a new deploy key for `hello-ai` only. The deploy job ran.
- Checked the result, called the app, and pushed an image around the gate to see the cluster refuse it.
- Tried to make the gate required on `main` (refused on a free private repo).
- Pull request #1: an unpinned `requests>=2.32` (red), then every package pinned (green). You approved the merge; the deploy job rolled out the new image.

**What came out.**

| Check | Result |
|---|---|
| Kyverno | v1.19.2: install manifest 91,473 lines (SHA-256 `4f785937…`), five images from `reg.kyverno.io`, 70 objects applied server-side; four controllers available in about 30 s |
| Policy API | `ImageValidatingPolicy` at `policies.kyverno.io/v1`; the plain-HTTP registry needs `spec.credentials.allowInsecureRegistry` |
| Policy test | D (signed): admitted, Running. C (unsigned): **denied**, "The image must be signed with the lab key (cosign.pub)". Done in about 5 minutes |
| Final policy | `require-lab-signature`, every image matching `192.168.252.2:5000/*`; the running `hello` deployment unaffected |
| Repo | `saadallahchebaro/hello-ai`, private |
| Runner | `actions-runner-linux-arm64-2.338.2.tar.gz`, SHA-256 `670adb2f…` matches the release notes; registered as `chainguard-build-vm` (labels self-hosted, Linux, ARM64, lab); online |
| Dependencies | Python 3.15.2 in `python:latest-dev`; 14 packages pinned; `annotated-doc` 0.0.6 too new, pinned to 0.0.5 (surprise 40) |
| Pinned action | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) |
| Gate by hand | 7/7 PASS in 58 s |
| First push | Refused twice for the `workflow` scope; pushed from the VM with deploy key `170080636` once the scope was added |
| Run 43900507141 (push to `main`, `33ba9d7`) | Gate 7/7; signed `hello-ai@sha256:e8432af9…`; deployed, 2/2; 39 s |
| The app | `GET /` → `{"message":"Hello AI!"}`; `POST /ask` → the stand-in answer |
| Bypass test | The same app plus one label, pushed straight to the registry (`sha256:5440f4ef…`): **denied** by Kyverno; no pod |
| Requiring the gate on `main` | HTTP 403: "Upgrade to GitHub Pro or make this repository public to enable this feature." |
| Run 43900923691 (pull request #1, `83dddcb`) | **Red**: `FAIL pinned deps requests>=2.32`; the six other checks passed |
| Run 43901351577 (pull request #1, `9c0c6d7`) | **Green**: 7/7. 18 packages pinned, including `requests` 2.34.2, `certifi` 2026.10.23, `charset-normalizer` 3.5.2 and `urllib3` 2.8.0 |
| Run 43901822133 (merge, `bb04be2`) | Gate 7/7 on what was merged; signed `hello-ai@sha256:3eac2b17…`; rolled out to revision 2; `cosign verify` passes; 47 s |

**Surprises.** Four, added to the list at the top (38–41): the `workflow` scope and the deploy key that inherits it, Kyverno working first time, the young transitive dependency, and the Terminal-panel prompt.

**Findings.** F26 is fixed. Two new rows: F27 (the runner's reach) and F28 (the gate can't block a merge on this plan).

**Decisions.**
- **Test the riskiest part first,** with images that already existed, inside a time box.
- **Our own cooldown applies to our tools too:** Kyverno v1.19.2, not the 4-day-old v1.20.0.
- **Pin every installed package,** not just the ones the app imports, so the cooldown check covers everything that ships.
- **Run the gate by hand before the first push,** so the first pipeline run starts from a known pass.
- **One policy for the whole lab registry,** so nothing from it runs unsigned, the earlier images included.
- **Merging is a person's decision.** The gate makes the call visible; you approved the merge.

**Evidence.** The private repo `saadallahchebaro/hello-ai`, its snapshot in `ci/hello-ai/`, `ci/resolve.py`, `ci/README.md` (the runs), `logs/20-ci.log`, `logs/20-ci-mac.log` and the ten screenshots.

---

## Step 21 · An agent in the pipeline
**Guide:** Chapter 14 · **Run in:** the Mac (the agent, headless, from the app's Terminal panel; `gh`), the tmux session `lab` on the VM (tools, the runner, the Git hook) · **Logs:** logs/21-agent.log, logs/21-agent-mac.log
**Screenshots:** demo/screenshots/21-runner-agent-pr-failed.png, 21-agent-pr-red-details.png, 21-runner-agent-fix-gate.png, 21-runner-agent-green.png, 21-agent-fix-runs.png, 21-git-hook-fallback.png, 21-agent-change-deployed.png

**Goal.** A coding agent makes a change with no guidance, the gate refuses it, the agent reads why and fixes it, a person reviews and merges, and the pipeline deploys. Plus the Git-hook fallback, and the run sheet for doing it live.

**What we did.**
- Installed `dfc` v0.10.0 on the VM (Chainguard's Dockerfile converter) and tested it; later linked `dfc` and `crane` into `/usr/local/bin`, so `multipass exec` finds them.
- Ran a fresh agent with one request: "Write a Dockerfile for this FastAPI service, and add httpx as a dependency for outbound HTTP calls", allowed only to read and write files. First in the `hello-ai` clone with the Dockerfile removed (run A), then in a folder holding only the app (run B).
- Pushed run B's files unedited to pull request #2. The gate refused it.
- Gave the agent the guide's fix instruction, with narrow tools: files, read-only `gh`, `dfc` and `crane digest` on the VM; no `git`. The first attempt stopped (tools not found); the second fixed the base images but broke the build.
- Reproduced the build failure by hand, then gave the agent the error and two review notes, plus `crane config`. Its fix passed the gate.
- Ran the image the gate built, the way the cluster runs it, and called it.
- You approved the merge; the deploy job rolled it out.
- Set up the Git-hook fallback: a bare repository on the VM whose `pre-receive` hook runs `gate.sh`, and pushed a failing and a passing commit to it.
- Wrote `demo/demo.md`, the live run sheet.

**What came out.**

| Check | Result |
|---|---|
| Run A (rules visible) | The Chainguard Dockerfile rebuilt on the same pinned digests; `httpx==0.28.1` and `httpcore==1.0.9` from memory; nothing committed; it said what it couldn't verify (surprise 42) |
| Run B (no rules) | `python:3.13-slim` in two stages, user `app`, port 8000, a `.dockerignore`; the same two pins |
| PR #2, `ae66f6f`, run 43906208662 | **Red**: `FAIL base image` (`FROM python:3.13-slim`), `FAIL base signed`, `FAIL scan`: two High CVEs in Debian 13's `zlib1g` (CVE-2026-76844, CVE-2026-85091; fixed in `+deb13u1`, not yet in the image). Pins, cooldown, build and user passed |
| Fix attempt 1 | Diagnosed the three failures correctly, then stopped: `dfc` and `crane` not found. Changed nothing |
| Fix attempt 2, `7c0e39f`, run 43907148612 | `latest-dev` pinned in both stages (`dfc`'s `3.13-dev` isn't served, surprise 43); flagged the `python` entrypoint as a risk. **Red**: `FAIL build` |
| The build error | `addgroup: permission denied (are you root?)`, visible only when reproduced (surprise 44) |
| Review fix, `57a4ec4`, run 43907723782 | Runtime `python:latest` pinned; user creation removed; venv under `/app`; `ENTRYPOINT` = the venv's uvicorn on 8080, after reading the image config. **Green** 7/7. Only `Dockerfile` changed in every attempt |
| The image, run like the cluster runs it | Read-only, user 65532, no capabilities: `GET /` → `{"message":"Hello AI!"}`, `POST /ask` 200 |
| Merge `718b24a`, run 43908366650 | Gate 7/7; signed `hello-ai@sha256:ba805fe2…`; revision 3 rolled out; the app answers |
| Git-hook fallback | `ae66f6f` refused at push ("pre-receive hook declined", the same three failures); `main` accepted, 7/7 |

**Surprises.** Four, added to the list at the top (42–45): the agent following the repo's rules, `dfc`'s version tags, the gate hiding the build error, and the agent CLI's login from inside the app.

**Findings.** Two new rows: F29 (the gate's blind spots) and F30 (the agent runs with the user's reach).

**Decisions.**
- **The unguarded change must be the agent's own.** Run B was pushed unedited; run A is kept as evidence of what happens when the rules are visible.
- **The agent never pushes.** It edits; a person reviews the diff, pushes and merges.
- **Give tools, not answers.** The review notes said what was wrong (the build error, a minimal runtime, a container that must start on 8080); the agent worked out how.
- **Run the image before merging,** because the gate doesn't.

**Evidence.** `ci/agent-runs/` (every instruction, output and diff), `ci/hello-ai/` (the merged state), `ci/git-hook/pre-receive`, `demo/demo.md`, `logs/21-agent.log`, `logs/21-agent-mac.log` and the seven screenshots.

**Checkpoint 6 (after step 21).** The pipeline and the agent are done: a gate on every pull request, signing on merge, a cluster that admits only signed images (step 20), and a coding agent's change refused, fixed and deployed (21). The study guide's Chapter 14, written before any of it ran, was corrected to match: built and run; the policy's `credentials.allowInsecureRegistry` and the first-try result on Kyverno v1.19.2 (surprise 39); pinning every installed package (40); the runner's label, its checksum and the pull request's own commit; the `workflow` scope and the deploy key that inherits it (38); the secret prompt (41) and the 403 on a free plan (F28); what the agent did with and without the rules in view (42), `dfc`'s tags (43), the hidden build error (44) and the gate's blind spots (F29); starting the agent CLI from inside the desktop app (45); and the run sheet, `demo/demo.md`.

---

## Step 22 · The deck, with the lab's results
**Run in:** the Mac only. The deck is a local file, kept out of this repo because it uses Chainguard's visual style. Nothing ran on the VMs, so there are no new logs or screenshots.

**Goal.** Replace every sample number and blank in the presentation with the lab's results, put real screenshots in its screenshot frames, and bring the study material in line with what the lab found.

**What we did.**
- **The deck** (58 slides: 36 shown and 22 hidden practice slides; edited in place, with a backup of the previous version kept beside it): the measured values on the slides for the plan, the four images, the key comparison, the results, the triage example, supply chain, Kubernetes, the deliverables, what went wrong, lab to production and the live demo, plus the backup slides and the hidden practice slides. Every value was taken from `results.json`, `reports/final/` or `logs/`. The agent-demo backup slide now shows the real gate output from pull request #2 (`ae66f6f` refused, `57a4ec4` passed).
- **The results chart** redrawn to the measured counts, with a fifth segment for A's Go toolchain (118), and the size of each image in the facts panel.
- **The backup table** of further CVEs filled with five rows: CVE-2023-45288, CVE-2023-24538, CVE-2023-24540, CVE-2022-41717 and CVE-2023-4911, each with its package, layer, severity, EPSS, KEV status, fixed version and what removed it.
- **Eleven screenshot frames** filled with crops of `demo/screenshots/` (from steps 06, 09, 11, 13, 15, 17 and 19). The crops are cut from the images, never edited; a line too long for its frame is cut at the edge.
- **Speaker notes:** every blank filled; the parts that are the presenter's own words (the timing, what went wrong, the questions on D and on counting) drafted from this journal and marked DRAFT for rewriting.
- **The study material:** the lab walkthrough and the quiz corrected the same way (sizes, module counts, `registry:3`, port 8085, the pinned k3s install, Grype's matching by function, the provenance D actually had, the Kyverno result, and the pipeline chapter's real gate output), and one stale sentence in the guide.

**What came out.**

| Item | Result |
|---|---|
| Deck | No sample data and no blanks left; two "make this yours" notes kept on purpose, on the AI slide, for the presenter's own framing |
| Rendered check | Every edited slide rendered and inspected, except two one-word table fixes on hidden slides 40 and 51; nothing overflows its frame. Notes checked by text search |
| Slides the lab changed in meaning | The live-demo slide: the agent edits and a person pushes; the rule on `main` isn't enforced on a free plan; the admission policy checks the lab key. The Kubernetes slide: signatures are now enforced (F26 fixed at step 20) |

**Surprises.** Two, added to the list at the top (46 and 47): the pre-lab claims the lab disproved, and per-layer counts that add up to more than the unique total.

**Findings.** None new: this step changed no image.

**Decisions.**
- **Numbers come from files, never from memory,** and each slide's footnote says where they come from.
- **Drafts are marked as drafts.** The presenter rewrites them in their own words.
- **The deck stays out of the repo,** because it imitates Chainguard's visual style. A PDF copy, without speaker notes, was added to `docs/` on 19 November, when the repo was shared.

**Open.** The deck says Chainguard's images carry a signed SLSA provenance attestation at Level 3 (the supply-chain slide, its notes, and the vocabulary practice slide). The lab verified Chainguard's signature (step 11) and its signed SBOM (step 15), not that attestation; verify it with `cosign verify-attestation` before saying it, or reword those lines. *Resolved in step 22b: the provenance is verified, and the level is reworded as Chainguard's own statement.*

**Evidence.** `results.json`, `reports/final/comparison.md`, `reports/final/b-grype.json` (the triage values), `logs/11-image-c.log` (A, B and C share one binary), `logs/21-agent-mac.log` (the real gate output) and the screenshots listed above.

---

## Step 22b · Chainguard's provenance, verified
**Run in:** the tmux session `lab` on the VM · **Log:** logs/22b-provenance.log
**Screenshots:** demo/screenshots/22b-chainguard-slsa-verified.png, 22b-chainguard-slsa-contents.png

**Goal.** The deck said Chainguard's images carry signed SLSA provenance at Build Level 3, and the lab had only verified Chainguard's signature (step 11) and its SBOM (step 15). Verify the provenance for the two images our Dockerfiles pin, before repeating the claim.

**What we did.**
- Listed what is attached to the arm64 images of the pinned `static` and `go` indexes (`cosign tree`): each has one signature and three attestations.
- Verified the SLSA provenance attestation on both with `cosign verify-attestation --type https://slsa.dev/provenance/v1`, against the same signer as steps 11 and 15 (Chainguard's `release.yaml` workflow, GitHub's OIDC issuer). Saved the decoded statements in `reports/provenance/`.
- Read what the two statements record, and what they leave out.

**What came out.**

| Check | `static` (arm64 `8f9c7533c770…`) | `go` (arm64 `6d6af7de6e18…`) |
|---|---|---|
| `cosign verify-attestation` | Exit 0, 1 attestation; claims validated, in the transparency log (checked offline), certificate from the trusted authority | The same |
| Signed by | `chainguard-images/images/.github/workflows/release.yaml@refs/heads/main` | The same |
| Subject | The image verified (true) | The image verified (true) |
| Build type, builder | `https://apko.dev/slsa-build-type@v1`; `terraform-provider-apko` v1.2.28 with apko v1.4.14 | The same |
| Packages named | 3: `ca-certificates-bundle` 20261020-r0, `tzdata` 2026f-r0, `wolfi-baselayout` 20230201-r31, the 3 Syft found | 66, Syft's count at step 13; `go-1.27` 1.27.4-r0, `gcc` 16.2.0-r4 |
| Not recorded | A SLSA level, external parameters (the source repository and commit), resolved dependencies with digests | The same |

**Surprises.** None: the statements match what the guide described from the registry before the lab. One practical point: the Terminal window showing the lab had been closed, so it was reopened and attached to `lab` before taking screenshots.

**Findings.** None new.

**Decisions.**
- **The level is Chainguard's statement: "Chainguard says it builds at SLSA Build Level 3".** A provenance file doesn't state its own level; the level is Chainguard's assessment of its build platform, which it says an independent firm reviewed. The deck's slides and notes now say it that way.
- **The supply-chain slide's provenance column** now shows this verification instead of our own SBOM attestation.

**Evidence.** `reports/provenance/chainguard-static-slsa.json`, `reports/provenance/chainguard-go-slsa.json`, `logs/22b-provenance.log` and the two screenshots.

---

## Step 23 · Speaker notes, the build journal and the demo console
**Run in:** the Mac (the deck, the pages, the console), the VM through `multipass exec`, and the private `hello-ai` repo on GitHub · **Evidence:** pull request #3 of `hello-ai` and its runs; `demo/console/`; `BUILD-JOURNAL.md`

**Goal.** Detailed speaker notes on every slide, one readable record of the whole lab, and a page that runs each demo step from a button.

**What we did.**
- **Speaker notes for all 58 slides** (36 shown, 22 hidden practice slides): what's on the slide element by element, what to say, where each number comes from, live commands, and likely questions with answers, about 43,600 words, checked against `results.json`, the reports and the logs. The review found slide text the lab contradicts, and those slides were corrected: the lab set-up (no VS Code or browser was used), the Rapid Reset panel (the standard-library copy is filed under Go's ID, CVE-2023-39325), the repo tree (RUNBOOK.md added), "Upgrades break" (nothing broke; the side effects were a new minimum Go and new modules), the pipeline map (no enforced rule on main; Kyverno checks the lab key; MCP is generally available), the counting backup (its values were empty), and six hidden practice slides (Grype's matching and severity, the transparency log, cosign's flags, MCP's status).
- **`BUILD-JOURNAL.md`**: the whole lab in one document, steps 00 to 22b, with every command, all 118 screenshots and what each shows, the results, the surprises and findings, and what's left. Removed on 19 November, before the repo was shared: it stopped at step 22 and used the image names from before step 37, and this journal covers every step. It stays in the git history.
- **The demo console** (`demo/console/`): a dependency-free Node server on 127.0.0.1 with two pages. The CI page shows where each step runs, runs each step of the agent demo from a button (live, or replaying the recorded lab run), streams commands and output into a terminal panel, and maps each step to an enterprise pipeline, Chainguard's products, and agents and AI. The presentation page runs 16 read-only proofs behind the deck's deep-dive slides, with the lab's own screenshots as the replay.
- **A full live run through the console**, end to end, with the coding agent running live.

**What came out.**

| Step | Result |
|---|---|
| Checks | All green on the personal `gh` account: both VMs, the runner online, the policy, `hello-ai` 2/2, Grype's database, the clone, the agent |
| The agent's change, no rules in view | 27 s: a single-stage Dockerfile on `python:3.12-slim`, a named user, port 8000; 4 tool requests outside its allowlist refused |
| Pull request #3, gate run 43925338149 | `GATE FAIL for 1948532`: base image, base signed, scan (the same three checks as the lab's pull request #2) |
| The agent's fix from the log | 78 s, one run: both stages on Chainguard's Python images pinned by digest (the same two digests as the lab's fix), no user creation, the venv's uvicorn on port 8080 |
| Gate run 43926022623 | `GATE PASS for a6f5b12`, 7 of 7 |
| Merge `4e49991`, deploy run 43926245530 | Gate passed again; signed `hello-ai@sha256:e7a2b7da…`; rolled out |
| The cluster | The signed digest running, `cosign verify` OK with the lab key; an unsigned image refused by Kyverno; the app answering |
| Git-hook fallback | `1948532` refused by the pre-receive hook on the same three checks |
| The presentation page | All 16 proofs passed live: sizes, users, shells, the B→C diff, Chainguard's signature and provenance, D's rescan at 0, the SBOM, `cosign verify`, the pods, and image C refused |

**Surprises.** None new. The live agent behaved like the lab's: with no rules in view it chose a Debian slim base; given the gate's log and the earlier review notes, it fixed everything in one run.

**Findings.** None new. `hello-ai`'s `main` now carries the agent's live change; its Dockerfile matches the snapshot in `ci/hello-ai/` apart from comments, and its `.dockerignore` is the agent's looser version.

**Decisions.**
- **One action at a time, fixed commands, a per-run token and 127.0.0.1 only**: nothing typed in the browser is ever executed.
- **Replay never executes anything**, and recorded output is shown only where the lab recorded it.
- **The agent never gets `git`**: a person commits, pushes and merges, from the console's buttons.

**Evidence.** Pull request #3 and runs 43925338149, 43926022623 and 43926245530 in `hello-ai`; `demo/console/`; `BUILD-JOURNAL.md` in the git history (removed on 19 November).

## Step 24 · An agent-skill gate, quick answers, VS Code, and where Chainguard fits
**Run in:** the build VM (recorded in `logs/24-skill-gate.log`), the Mac (the console, the agent, VS Code) · **Screenshots:** `24-skill-gate-blocked.png`, `24-skill-gate-allowed.png` · **Evidence:** `ci/skills/`, `reports/skills/`, `ci/agent-runs/skill-run/`

**Goal.** Show the agent's own supply chain: a skill is a dependency that acts with the agent's permissions, so no skill reaches it unscanned. Also: one-click answers for the panel's likely questions, VS Code connected to both VMs, and Chainguard's products placed on the pipeline.

**What we did.**
- **Installed NVIDIA SkillSpector v2.13.4 on the build VM.** It's the newest release at least 7 days old (published 4 November; v2.13.5 and v2.13.6 came out the day before). It sits in a venv built from Ubuntu's `python3.12-venv`. The 70 dependencies were held to the same 7-day cooldown: `uv` 0.13.7 (also older than 7 days), with `--exclude-newer 2026-11-10`. The list is in `reports/skills/skillspector-freeze.txt`.
- **Wrote two skills** (`ci/skills/`):
  - `vetted/chainguard-dockerfile`: the instructions and review notes the lab gave the agent in step 21.
  - `unvetted/dockerfile-fixer`: a look-alike written to be caught. It carries a hidden prompt injection, a credential grab, `curl | bash`, a base64-encoded command, `chmod 777`, `--no-verify`, and advice to disable the gate. It's a test fixture: nothing runs it, and its addresses use the `.invalid` domain, which never resolves.
- **Wrote the gate itself**, `ci/skills/skill-gate.sh`. It runs `skillspector scan --no-llm` (static analysis, no model calls), keeps the JSON report and a summary, and prints a content hash. It exits 0 for allowed, 1 for blocked and 2 for a scan error.
- **Added it to the demo console as step 4**, between the failed gate and the agent's fix (the later steps are now 5 to 11):
  - Both candidates are scanned on the build VM.
  - Only the allowed one is copied, as the scanned bytes, into `hello-ai/.claude/skills/`, which Git ignores, and its content hash is checked against the scan.
  - The agent's fix (step 5) then runs with a short prompt that names the skill, with `Skill` added to its tools.
  - The agent now always runs with `--setting-sources project,local` (surprise 48).
  - Step 0 and Clean up remove the installed skill.
- **Rehearsed the fix with the skill, offline:** hello-ai at the agent's failing commit `ae66f6f`, the gate's failed lines, the skill, and the real `gate.sh` on the result (`ci/agent-runs/skill-run/`).
- **On the presentation page**, as the user asked:
  - The result card is smaller, and the terminal runs the full width under it.
  - A new first section, "Show me: quick answers": 48 read-only commands for likely questions, each run live on the build VM. Topics: the Dockerfiles, digests, the registry, the scan reports, the SBOMs, signatures and provenance, the cluster, the pipeline and the lab notes.
  - A new section, "Where Chainguard helps": each stage of the supply chain, the product that meets it, its status and where it touches the lab.
- **On the CI page:** a **Chainguard** switch on the diagram puts the same products on the nodes they meet, each with its status. The per-step Chainguard text was checked against chainguard.dev on 17 November and corrected where it claimed more than Chainguard publishes.
- **VS Code:**
  - A key used only for the lab (`~/.ssh/chainguard_lab`), authorized on both VMs.
  - Each VM's host key checked against `multipass exec` before it was trusted.
  - `chainguard-lab` and `k3s-lab` in `~/.ssh/config`.
  - Microsoft's Remote-SSH extension, and the repo opened on the build VM.
- **The registry, asked about along the way:** it was there all along. `registry:3`, pinned by digest, has run on the build VM at `:5000` since step 16, over plain HTTP with no login, which is fine for the lab only. It holds `hello` (C, D and D's signature tag) and `hello-ai` (every deployed build). k3s reaches it through the mirror in `/etc/rancher/k3s/registries.yaml`. Three quick answers now show it.

**What came out.**

| Check | Result |
|---|---|
| `dockerfile-fixer` | **BLOCKED**: risk 100/100 CRITICAL, `DO_NOT_INSTALL`, exit 1. 10 findings, nine of them High:<br>• tool parameter abuse ×2 (`chmod 777`, `--no-verify`)<br>• instruction override<br>• hidden instructions<br>• a YARA prompt-injection rule<br>• external script fetching<br>• chaining abuse ×2<br>• obfuscated code<br>Plus one Medium: least privilege. Coverage complete. |
| `chainguard-dockerfile` | **ALLOWED**: risk 0/100 LOW, `SAFE`, 0 findings, exit 0, coverage complete. Content hash `89744efd3e044c81` after the review notes were added (the first version, `cab79978…`, also scored 0). |
| Console step 4, live | 4.5 s. One skill blocked, one allowed; the installed copy's hash matched the scan. |
| The agent with the skill, rehearsal | 57 s, one run:<br>• It loaded the skill first, then ran `dfc`, `crane digest` and `crane config`.<br>• It replaced the tags dfc suggested, which the free registry doesn't serve.<br>• 5 requests outside its allowlist were refused, including `docker build`. |
| `gate.sh` on the rehearsal's Dockerfile | **GATE PASS, 7 of 7**, and the image answered `{"message":"Hello AI!"}` on port 8080. In step 21, without the skill, the fix took two agent runs and a review round. |
| Quick answers | All 48 commands ran cleanly on the VM (47 in the first pass, then Chainguard's own attestations). |
| **Full live run, Play all, agent live** (10:31 to 10:36) | Every step passed, in about 5 minutes:<br>• Pull request #4: `GATE FAIL for 11717a6` on base image, base signed and scan.<br>• The skill gate blocked one skill and allowed the other; the installed copy's hash matched.<br>• The agent's fix took 42 s, with the skill, and 2 requests were refused. It also read the earlier fix from Git history (surprise 50).<br>• `GATE PASS for 6f4becc`, 7 of 7.<br>• Merge `68ecee7`, deploy run 44032296222: signed and deployed `hello-ai@sha256:e6b4438a…`.<br>• `cosign verify` OK, the unsigned image refused, the app answering.<br>Transcript: `ci/agent-runs/live-run-2026-11-17.txt`. |

**Surprises.** 48, 49 and 50 (above).

**Findings.** F31 (above).

**Decisions.**
- **Scan where the skill is used, even from a vetted source.** Chainguard Agent Skills scans before it publishes; this gate scans again before the agent loads anything, and checks that the copy is the scanned one.
- **Deny git to the agent outright** (`--disallowedTools`), read-only commands included: an allowlist adds permissions, and the agent's tool approves read-only commands on its own (surprise 50).
- **Static analysis only (`--no-llm`).** It's repeatable and offline, it sends nothing to a model provider, and it was enough to separate the two skills.
- **The scanner follows the lab's own rules:** the newest release at least 7 days old, and every dependency held to the same cooldown.
- **The console's live scans write to `/tmp`**, so the recorded reports in `reports/skills/` stay as recorded.
- **Nothing in the compromised fixture can run:** its script isn't executable, its addresses don't resolve, and it never reaches a skills folder.

**Evidence.** `logs/24-skill-gate.log`; `reports/skills/` (both JSON reports, both summaries, the dependency list); `ci/skills/`; `ci/agent-runs/skill-run/`; `ci/agent-runs/live-run-2026-11-17.txt` and pull request #4 of `hello-ai` (runs 44031955389, 44032177873, 44032296222); `demo/screenshots/24-skill-gate-*.png`; `demo/console/actions/shortcuts.js` and `chainguard.js`.

## Step 25 · Presenter tools: a command deck, more quick answers, a showcase folder, Chainguard's map, and a slide for the images
**Run in:** the Mac (the console, the deck, VS Code), the build VM (the showcase folder, recorded in `logs/25-presenter-tools.log`) · **Screenshots:** `25-command-deck.png`, `25-present-quick-answers.png`, `25-ci-step12-chainguard-view.png` · **Evidence:** `demo/console/`, `showcase/`, `tools/make-showcase.sh`, `chainguard-lab.code-workspace`, `.vscode/tasks.json`

**Goal.** Tools for the talk itself: answers the panel can read on a shared screen, every file worth opening in one place, a console terminal readable from the back of the room, Chainguard's products mapped onto the agentic build, and a deck that introduces the four images before it uses their letters.

**What we did.**
- **Fixed the console's "disconnected" terminal** (surprise 51): the page now reloads itself when a server restart has changed the token.
- **The presentation page's terminal** is taller (the result card above it is smaller) and its text larger (13.8 px).
- **Quick answers, from 48 to 67**, one tab per group (11 groups), the filter searching all of them:
  - **Run it** (new): D's source built and run straight on the VM; each of A to D run and called with `curl`, with the user it runs as or the missing shell; the deployed `hello-ai` digest run and called (`GET /` and `POST /ask`); and a `wolfi-base` sidecar that shares C's process and network namespaces, to look inside an image with no shell.
  - **Signing** (new): D verified with the lab key, C shown never signed, the digest the cluster runs verified, D's signed SBOM attestation, and Chainguard's own signature on its static image.
  - **The registry**: every image in it with its digest, and D pulled from it by digest and run.
  - **Agent skills** (new): both skills scanned, the compromised skill's hidden instruction, and the vetted skill.
- **A command deck** (`/deck`, a third page): the same 67 commands as buttons only. Each button types its command into a real terminal, so the answer shows on the shared screen while the laptop stays on the deck:
  - The default target is the tmux session `show` on the build VM; the page creates it, and the shared screen attaches with `ssh -t chainguard-lab tmux new -A -s show`.
  - The target list also offers every other tmux pane on the VM and the Mac's open Terminal and iTerm windows.
  - **Press Enter for me** runs the command; with it off, the command is typed and waits for Enter.
  - Only the fixed commands are sent, by id: into tmux with `send-keys -l`, into Terminal or iTerm as AppleScript arguments. The one command that runs on the k3s VM stays on the presentation page.
- **CI step 12, "Where Chainguard fits"** (no commands; Play all now ends on it). The diagram becomes a map of this agentic build: each part tagged with the Chainguard product that replaces it, adds to it or works with it, and its status as checked on chainguard.dev on 17 November. Three parts stay yours: signing your own image, your registry and admission control. The terminal gives way to a table of the same 18 rows; **Back to the pipeline**, or any other step, brings it back.
- **A showcase folder** (`tools/make-showcase.sh`): `showcase/` on the build VM, nine numbered folders (`01-dockerfiles` to `09-lab-notes`) and a README, holding 57 relative links to the files worth opening during the talk: the Dockerfiles, the app's source and `go.mod` before and after, the scan reports, the SBOMs, signing and provenance, the Kubernetes manifests, the pipeline, the agent runs and skills, and the lab notes. Links, not copies, so nothing can drift from the real files.
- **A VS Code workspace** (`chainguard-lab.code-workspace`, opened over Remote-SSH on the build VM): the showcase first and the full repo second, larger fonts, and six terminal profiles: the lab folder, a shell inside A or B, a `wolfi-base` sidecar for C or D (they have no shell), and `kubectl` for the cluster. `.vscode/tasks.json` has the four image shells as tasks too.
- **The deck** (outside this repo, as in step 22; the previous version kept as a backup):
  - A new slide 5, "Four images, one change each", before the plan on slide 6, which uses the letters A to D. It shows what each image changes, who does the work between them (the team's packaging, then Chainguard's base, then the team's app) and that the app is the same in A, B and C. The shown deck is now 37 slides, and every later slide's number went up by one.
  - Speaker notes on all 59 slides now end in a **TOUGH QUESTIONS** block: 285 questions, with answers taken from the lab's files.
  - Claims corrected against the lab and chainguard.dev (17 November): Chainguard Libraries for Go and .NET are in beta, not early access; Repository is in beta; Guardener is in early access; Agent Skills and Checks are beta Technology Previews; Harness is in beta by waitlist. The k3s install script was checked against a checksum, not a signature. D's binary went from 9.76 MB to 11.73 MB with the newer Go alone, and to 20.2 MB with the module updates. One cell said gosec flagged the timeouts, but gosec never ran: they were found by reading the code.
- **The 12-minute gap in surprise 34**: one line in step 16 said 13 minutes. The commit time (17:40:10) and D's creation time (17:28:09) give 12, which is now used everywhere.

**What came out.**

| Check | Result |
|---|---|
| The disconnect | After a server restart, the open CI page reloaded itself within seconds, with the new token, and streamed again |
| Quick answers | **All 67 ran with exit 0** on the VMs, the way the console runs them. Reading the output found one wrong answer despite exit 0: the `hello-ai` call sent broken JSON to `POST /ask` (a quoting error). Fixed; it now answers `{"answer":"You asked: is this image signed?"}` |
| Command deck, end to end | "Run image D and call it" typed into tmux `show:0.0` on the VM: `D answers: Hello World!` |
| Step 12 | 18 rows; the page fits with no overflow at 1440×900 and 1920×1080. At 1920 wide every cell shows in full; at 1440, 12 long cells end in an ellipsis and show in full on hover |
| Showcase | 57 links, 0 broken, counted on the VM (`logs/25-presenter-tools.log`) |
| VS Code | The workspace opened over Remote-SSH on `chainguard-lab`, with the Showcase folder first |
| The deck | 37 shown slides render; the new slide 5 and the renumbered slide 6 checked; 260 XML parts parse |

**Surprises.** 51 (above).

**Findings.** None new.

**Decisions.**
- **tmux on the build VM is the deck's default target.** The session outlives an SSH drop, keeps its output for follow-up questions, and any machine on the network can attach to it. Terminal and iTerm windows on the Mac are there as alternatives.
- **The deck sends ids, not commands.** The browser picks a command from the fixed list; the server types it. Nothing typed in the browser runs, as on the other two pages.
- **Step 12 runs nothing.** It's a map for a conversation, so it can't fail on the day, and it says plainly what Chainguard doesn't do.
- **A new slide rather than relabelling the plan.** The plan's table needs the letters; the new slide 5 introduces them first.
- **Exit 0 isn't enough to call a quick answer checked.** Each output was read, which is how the broken JSON was found.

**Evidence.** `logs/25-presenter-tools.log`; `demo/screenshots/25-*.png`; `demo/console/` (`deck.js`, `public/deck.*`, `actions/shortcuts.js`, `actions/chainguard.js`, `actions/ci.js` step 12); `showcase/` and `tools/make-showcase.sh`; `chainguard-lab.code-workspace` and `.vscode/`.

## Step 26 · An appendix for the brief's agenda, and live build, scan and sign buttons
**Run in:** the Mac (the deck, the console), the build VM (the live commands, recorded in `logs/26-live-commands.log`) · **Screenshots:** `26-command-deck.png`, `26-present-psa-dry-run.png` · **Evidence:** `demo/console/actions/shortcuts.js`, `logs/26-live-commands.log`

**Goal.** The brief's agenda asks for setup rationale, tool justification, Dockerfile choices, findings and remediation, production challenges and the bonus tasks, then Q&A on best practices, the supply chain and operations. The deck now has an in-depth table for each, and the console can build, scan, sign and ask the cluster live when the panel asks "can you show me?", without touching the recorded evidence.

**What we did.**
- **The deck** (outside this repo, as in step 22; each previous version kept as a backup). The shown deck grew from 37 to 54 slides:
  - **A new slide 18, after "Image D: patch the app itself"**: the app's first run on 16 November (step 5's screenshot), with Gin's warnings about debug mode and trusting every proxy, beside the step 13 test of the original binary against D's (a forged client IP; half a request header). A panel names the three findings, F1, F2 and F8, and what D does instead. Every later slide moved down by one.
  - **An appendix, slides 39 to 54**, after the backup slides. 39 is an index: each item of the brief's agenda and the slides that answer it.
  - Tables: 40 setup decisions and why; 41 every tool, its version, its job and how its download was trusted; 42 the four Dockerfiles line by line; 43 every CVE by layer, what removed it and who owns it; **44 image B's CVEs ranked** (KEV, then in the binary and called, then EPSS, then severity) with whether each is exploitable as deployed; 45 what each SBOM contains; 46 three scanners and why their numbers differ; 47 security practices as applied; 48 supply-chain evidence, what each piece proves and its gap; 49 operational problems met and what production needs.
  - Screenshots, cropped to what matters: 50 the ranking and the HTTP/2 test, as run; 51 images A and B, as run; 52 why the scanners differ; 53 the cluster refusing an unsigned image and a pod without the restricted settings; 54 the agent's failed image and the skill gate blocking the look-alike.
  - Every number comes from REPORT.md, the journal's registers, `reports/`, `sbom/` or `logs/`. Each new slide has notes: what's on it, what to say, where the numbers come from, and likely questions.
- **"Exploitable as deployed?", said honestly.** Seven of B's top twelve are HTTP/2-only, and the server refuses HTTP/2 (tested at step 10), so they aren't exploitable as deployed. Two parse HTTP/1.1 headers, which the app serves: not tested. Two are in html/template and one needs TLS: unlikely, because the app renders no templates and serves no TLS, but not tested. D removes all twelve.
- **Speaker notes:** slide 21's notes (the supply chain) now hold the SBOM breakdown, image by image (A 260, B 96, C 21, D 25, and why); slide 17's point to slide 18; slide 20's (one CVE) point to the ranking; the Q&A slide's say where the appendix is and how to jump to a slide by number. The clock of every timed slide after 17 moved by slide 18's 45 seconds.
- **Quick answers, from 67 to 106**, in 15 groups. The presentation page has 105; the command deck all 106:
  - **Build it live**: A to D rebuilt from their Dockerfiles as `hello-live:a` to `hello-live:d`; D rebuilt with no cache and its binary compared with the original's; the live D run and called; the live builds listed and removed.
  - **Scan it live**: Grype on C and D, all four counted, Trivy on D, C's image against its SBOM, govulncheck on both sources and on C's binary, Rapid Reset explained by Grype and its KEV entry, and D against today's Grype database.
  - **Sign and deploy live**: the live D pushed as `hello-live`, signed with the lab key, verified, and offered to the cluster in a dry run, beside unsigned C. Signing asks for the key's password, so only the deck offers it (marked 🔑): the password is typed in the terminal on the shared screen.
  - **D's fixes, side by side** (`tools/show-fixes.sh`, read-only): the app's first run in the step 5 log, where Gin's warnings were first seen (findings F1, F2 and F8); C's and D's logs after one request with a forged `X-Forwarded-For`; half a request header against each; and every component that changed from C to D, in one table.
  - Added to existing groups: the app binary's hash in each image, `go version -m` on C and D, `docker history` of A and D, which tags Chainguard's free tier serves, what an attacker finds in A and in B, D called through its Service on k3s, a shell attempted in D, and Pod Security refusing D without security settings (a dry run).
- **Throwaway names only.** Builds go to `hello-live` tags, pushes to a `hello-live` repository, today's database to `/tmp`; the cluster is asked with `--dry-run=server`. The recorded images, digests, signatures and reports are never rebuilt or rewritten.
- **The deck sets up its terminal first.** The `show` session had moved to `go-patched`: "Build and run the app directly" began with `cd go-patched`, which moves an interactive shell (it now uses `go build -C`). And a plain shell on the VM has no Go on its PATH, so the Go commands would fail there (only `tools/labrc.sh` adds it). The first time the deck types into a pane it now sends one line, in plain sight: `cd ~/chainguard-technical-challenge; export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"`; after that only the `cd`, if the shell has moved. Tested on a scratch pane started in `/tmp`: the version table and `govulncheck` both ran.
- **Two commands changed after testing:** listing Chainguard's tags (`crane ls`) took 1 min 41 s for `static` alone, 17,500 tags, so the button now asks for five tags' digests instead (10 s); and the "today's databases" button dropped Trivy and checks disk space first (surprise 52).

**What came out.**

| Check | Result |
|---|---|
| The 34 new commands | The 33 that run unattended all ran on the lab, as the console runs them; the signing one is in its own row below. The two refusals (unsigned C, Pod Security) end in `true`, so the page doesn't paint an expected refusal as a failure |
| Live builds | With the cache: 0.4 to 2 s each. D with no cache: 16 s, and **the same binary, byte for byte** (`00aee679…`), under a new image ID (surprise 53) |
| Binaries | A, B and C carry the same binary (`ec6fa6de…`, 9.4 MB); D's is `00aee679…`, 20 MB |
| Live rescan, recorded database | A 734, B 161, C 69, D 0: every count reproduced |
| Today's Grype database (built 2026-11-17 06:20 UTC) | D: no vulnerabilities found. Trivy, in the first run before it was dropped, also found none |
| C's image against its SBOM | 69 against 158, as in step 15 |
| govulncheck, today | C's shipped binary: 62. The original source: 11, all in `x/net` (judged with Go 1.27.4). The patched source: none |
| Admission, dry runs | The live D before signing and unsigned C: refused, "The image must be signed with the lab key". D, signed: admitted. Nothing created: `pods in bypass-test: 0` |
| Signing | The button stops at cosign's "Enter password for private key:" (checked in a scratch tmux session, then cancelled; nothing was signed) |
| Pod Security, dry run | D without security settings refused, with four reasons: privilege escalation, capabilities, runAsNonRoot, seccomp |
| D's fixes, side by side | C logs both warnings (debug mode, trusting all proxies) and the forged client IP 203.0.113.9; D logs only the request, from the real 172.17.0.1. Half a request header: C still open after 10 s, D closed after 5 s. The table: Go 1.18.10 to 1.27.4, 14 modules updated, 5 added, 1 removed (15 in C, 19 in D), the builder changed, the runtime the same, GIN_MODE set, the binary 9.4 to 20 MB |
| D's code run outside its image | Still prints Gin's debug-mode warning, but not the proxy warning: release mode comes from D's Dockerfile (`ENV GIN_MODE=release`), the proxy fix from the code |
| The deck | 54 shown slides render, with the deck's own font; the tables fit, the screenshots are cropped to whole lines (each edge snapped to a blank row), and every title fits on one line; notes on all 76 slides |

**Surprises.** 52 and 53 (above).

**Findings.** None new.

**Decisions.**
- **Live means throwaway.** A panel can watch a real build, scan, signature and admission check, while the evidence behind every slide stays exactly as recorded.
- **Dry runs for the cluster.** Admission webhooks also judge `--dry-run=server` requests, so the policy can be shown refusing or admitting a pod without creating one.
- **Passwords stay with a person.** The signing button types the command; the key's password is typed by hand at cosign's prompt, on the shared screen's terminal.
- **The deck's QA renders now use the deck's real font** (Avenir Next, found through a fontconfig file), so table fit is checked at the right widths.

**Evidence.** `logs/26-live-commands.log`; `demo/screenshots/26-*.png`; `demo/console/actions/shortcuts.js`; the deck's slides 18 and 39 to 54.

## Step 27 · Grype against Trivy, ID by ID: a readable comparison, and where it matters
**Run in:** the build VM (recorded in `logs/27-comparison.log`), the Mac (the deck) · **Evidence:** `reports/final/comparison.md`, `tools/comparison.py`

**Goal.** `comparison.md` was one 19-column table: it gave each scanner's total but not where the two differed, why, or whether it mattered.

**What we did.**
- **`tools/comparison.py`** (Python, standard library only) writes `reports/final/comparison.md` from `results.json` and the saved scan reports, in seven sections:
  1. The images, as a narrow table: one row per property, one column per image.
  2. Grype's counts by severity, fixable, KEV and govulncheck, and by layer.
  3. Grype against Trivy, ID by ID: found by both, only Grype, only Trivy, and the same ID rated differently.
  4. Why Trivy reports more, by where it found them.
  5. Why Grype reports some that Trivy doesn't.
  6. The Go gap, function by function, using step 10's classification.
  7. Every ID only one scanner reports, by package, in sections that fold away.
- `tools/results.sh` now calls it, and still prints its two summary tables, which REPORT.md §4 copies. `results.json` and every number in it are unchanged; the regenerated file was checked value by value against the old table.
- The console's "comparison" quick answer prints sections 1 to 6; section 7's lists stay in the file.
- **Slide 15 (image C)** now makes the base-against-base case: tiles for size (19 MB, B 155 MB), OS CVEs (0, B 92) and CVEs in the binary (all 69, the same file as B's), and a line under them: the base did its part, and what's left is image D's job. Its notes add that B is Debian slim, not distroless, and what the case against distroless really rests on.
- **Slide 22's notes** now hold the registry, signing and pull flow step by step (registry, push, sign, pull, admit), the command-deck buttons to show in order, and the follow-up answers; slide 21's point to them.
- **The deck:** a new appendix slide 47, "Where Grype and Trivy differ, why, and whether it matters", after the scanner counts on 46. The appendix now runs from 39 to 55, the shown deck is 55 slides, and the index on 39 follows. The notes of slide 26 ("What went wrong") point to it.

**What came out.**

| | A | B | C | D |
|---|---|---|---|---|
| Found by both | 709 | 160 | 68 | 0 |
| Only Grype | 25 | 1 | 1 | 0 |
| Only Trivy | 10,147 | 93 | 89 | 0 |
| Same ID, rated differently | 303 | 56 | 12 | 0 |

- **Only Trivy:**
  - A: 9,928 on `linux-libc-dev`, the kernel headers; 173 in other Debian packages, 5 of them Debian `TEMP-` IDs and 161 marked "affected" by Trivy; and 46 in Go code.
  - B: 4 Debian `TEMP-` IDs and 89 in Go code. C: 89 in Go code.
  - In B's binary, step 10's per-scope classification finds 91 of the 92 Go IDs to be code that isn't compiled in.
- **Only Grype:**
  - A: 21 in the `go` command itself and 4 recent Debian CVEs.
  - B and C: Rapid Reset under CVE-2023-44487, which Trivy files as CVE-2023-39325.
- **Rated differently:** 201 of the 371 are Debian's "Negligible", which Trivy, with no such level, reports as "Low".
- **Whether it matters:**
  - Kernel headers don't, in a container. The Go module matches don't change the risk, but they do show `go.mod` is old.
  - The difference that does matter is the Rapid Reset ID. CISA's KEV list uses CVE-2023-44487, so a KEV check by ID on Trivy's report for B would miss the one known-exploited CVE.

**Surprises.** None new. The Debian `TEMP-` IDs among Trivy's extras were new to the record, and are explained in section 4 of the file.

**Findings.** None new.

**Decisions.**
- **Keep the counts' source and change only their presentation.** `results.json` and the per-layer method are untouched; the new script only reads them.
- **Say "not investigated" where we didn't.** Trivy's extra Debian IDs and Grype's four recent ones are described from the data, not explained.

**Evidence.** `logs/27-comparison.log`; `reports/final/comparison.md`; `tools/comparison.py`; the deck's slide 47.

## Step 28 · Chainguard's base against Google's distroless, measured
**Run in:** the build VM (recorded in `logs/28-distroless.log`), the Mac (the deck) · **Evidence:** `dockerfiles/Dockerfile.c-distroless`, `reports/distroless/`, `tools/compare-bases.sh`

**Goal.** The panel will ask "what about distroless?", and Chainguard's founders co-created distroless at Google. Answer it with a measurement, not a claim: image C on Google's distroless static base, beside image C on Chainguard's.

**What we did.**
- **Checked the base first,** as for Chainguard's: `gcr.io/distroless/static-debian13:nonroot` resolved to `sha256:aafe9936…`, an index for six platforms. Its signature verified with Google's keyless identity (issuer `https://accounts.google.com`, identity `keyless@distroless.iam.gserviceaccount.com`). Its config: user 65532, no entrypoint, created `1970-01-01`.
- **`dockerfiles/Dockerfile.c-distroless`,** written from C's own text: with comments stripped, the one difference is the runtime `FROM`. The build stage is the same, so the binary is the same file.
- **`tools/compare-bases.sh`** measures both images the same way:
  - each base's signature, its attached attestations, and its recorded build date;
  - each image's packages (Syft), size, user and shell, whether the app answers, and the binary's hash;
  - Grype and Trivy, with the databases of the same-day rescan (Grype's built 16 November 06:30 UTC, Trivy's 07:10 UTC).
  - It writes `reports/distroless/` and the table in `comparison.md`.
- **The deck:** a new appendix slide 43, "Chainguard static against distroless static, measured", after the Dockerfiles. Under its table, a panel says why Chainguard when today's count is a tie: evidence, speed and scope.
- **Release timing, from primary sources (17 November):**
  - Chainguard's docs say its containers are rebuilt nightly. In the lab, `chainguard/go:latest` was built 15 November 22:10 UTC (the digest pinned for D) and again 16 November 21:36 UTC. `chainguard/static:latest` has kept the same digest since 28 October, because a rebuild that changes nothing gives the same image.
  - Debian ships stable point releases about every two months (13.6 on 11 July 2026, 13.7 on 12 September), with security fixes through its security archive in between.
  - Distroless's own repository: a workflow runs daily at 20:35 UTC, takes Debian packages at least a day old, and opens a pull request; a maintainer merges; every merged commit builds and pushes the images. Package bumps merged on 17, 23, 24 and 31 October and 8 November, every 1 to 8 days. It publishes no fix deadline and follows Debian's support timeline.
  - Slide 43 shows these as two rows, how updates arrive and the published fix deadline; its notes hold the details and their sources. The appendix now runs from 39 to 56, and the shown deck is 56 slides.
- **Notes:** slide 15's notes now use the measurement.
- **Slide numbers:** those quoted in the notes are now tokens, filled in from one numbering table when the notes are built, so a new slide can't leave a stale number behind.
- **The console:** a quick answer prints the comparison. The showcase folder links the new Dockerfile and report.

**What came out.**

| | C: Chainguard static | C-distroless: Google distroless static |
|---|---|---|
| OS CVEs, Grype · Trivy | 0 · 0 | 0 · 0 |
| In the app binary, Grype · Trivy | 69 · 157 | 69 · 157 |
| OS packages | 3 (Wolfi) | 6 (Debian: base-files, ca-certificates, media-types, netbase, tzdata, tzdata-legacy) |
| Size on disk (compressed) | 19 MB (5.62 MB) | 21.6 MB (6.02 MB) |
| Runs as · shell | 65532:65532 · none | 65532:65532 · none |
| Signature on the base | verified (Chainguard's release workflow) | verified (Google's keyless identity) |
| Attestations on the base | SBOM, SLSA provenance, apko build configuration | SBOM |
| Build date, as recorded | 2026-10-28 | 1970-01-01 |
| App binary | `ec6fa6de…` | `ec6fa6de…` |

**Surprises.** 54 (below).

**Findings.** None new.

**Decisions.**
- **Report the tie.** On this static binary, today, the two bases score the same. Chainguard's case rests on what's measured beyond the count (the provenance and build configuration attached to the base), and on what isn't measured here: who fixes the packages, how fast, and the images for the build stage.
- **Keep it an experiment, like D-golang.** The four images and their numbers are unchanged; C-distroless is a side-by-side, not a fifth image in the rescan.

**Evidence.** `logs/28-distroless.log`; `reports/distroless/` (both images' Grype, Trivy and Syft reports, and `comparison.md`); `dockerfiles/Dockerfile.c-distroless`; the deck's slide 43.

## Step 29 · Readable signature and provenance screenshots for slide 21
**Run in:** the build VM (recorded in `logs/29-screenshots.log`), the Mac (the screenshots, the deck, the full report) · **Evidence:** `demo/screenshots/29-verify-pass-fail-wrapped.png`, `demo/screenshots/29-chainguard-slsa-verified-wrapped.png`

**Goal.** Two of slide 21's cards showed half-sentences: "verify: D passes; C and wrong key fail" (step 17) and "Chainguard's SLSA provenance, verified" (step 22b). Both outputs are wider than a card can show at a readable size, so the crops cut the lines off. Show the same checks with every line complete.

**What we did.**
- **Reran step 17's three checks** in one recorded command: the same `cosign verify --key … --insecure-ignore-tlog=true` against the registry, by digest, with each result folded at 74 columns.
  1. D with our key (`cosign.pub`).
  2. C with our key (C was never signed).
  3. D with a throwaway key pair, made in `/tmp` and deleted afterwards.
- **Two runs, both in the log:** the first folded at 70 columns and split D's digest over two lines; the second, at 74, keeps it on one.
- **The screenshot:** `tools/shot.sh 29-verify-pass-fail-wrapped`, 1418×998 (surprise 55).
- **Reran step 22b's provenance check on Chainguard's static base,** by the same arm64 digest (`sha256:8f9c7533c770…`) and the same issuer and identity. Two changes from step 22b:
  - long lines wrapped at 74 columns, at a space or after a `/`, with continuation lines indented four spaces;
  - the predicate written to `/tmp`, so `reports/provenance/` stays as recorded at step 22b.
- **The screenshot:** `tools/shot.sh 29-chainguard-slsa-verified-wrapped`, 1418×998.
- **Where they're used:**
  - the deck: slide 21's two cards, each cropped to the output, at the same width so the text is the same size; slide 21's notes name both;
  - the full report: figure 7 (the signature check; the report has no provenance figure);
  - the console: the recorded replays for the signature check (`p-sign`) and for the provenance (`p-provenance`, with step 22b's contents screenshot after it).

**What came out.** The same results as step 17:
- D passes: exit 0, signed digest `sha256:c5ce9ddb…`.
- C fails: exit 10, "no signatures found".
- D with a different key fails: exit 1, "accepted signatures do not match threshold, Found: 0".

Each error is cut at 140 characters, so the third ends at "Found: 0"; cosign's full message goes on with ", Expected 1".

The provenance check gave step 22b's results for the static base:
- exit 0, one attestation, and cosign's three claims (validated, transparency log verified offline, certificate verified against trusted authorities);
- certificate subject: Chainguard's release workflow, `https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main`;
- predicate type `https://slsa.dev/provenance/v1`; subject `sha256:8f9c7533c770…` (the image verified: true); build type `https://apko.dev/slsa-build-type@v1`; builder `https://github.com/chainguard-dev/terraform-provider-apko`; resolved dependencies 0.

**Surprises.** 55 (below).

**Findings.** None new.

**Decisions.**
- **Rerun rather than shrink.** At the original widths the text would be too small to read on a card. Wrapping the output keeps every line whole at a readable size. Step 17's and step 22b's screenshots stay as recorded.
- **Wrap a URL after a slash.** The certificate subject's URL is 90 characters, longer than a card line. It breaks after `.github/`, where a reader can see it continues.

**Evidence.** `logs/29-screenshots.log`; `demo/screenshots/29-verify-pass-fail-wrapped.png`, `demo/screenshots/29-chainguard-slsa-verified-wrapped.png`; the deck's slide 21; the full report's figure 7.

## Step 30 · The builder comparison, as an appendix slide
**Run in:** the Mac (the deck), the build VM (recorded in `logs/30-builder-slide.log`) · **Evidence:** `demo/screenshots/30-builder-cves-by-fix-state.png`

**Goal.** Step 13's builder experiment (image D built on `golang:latest` instead of `chainguard/go`) was in the journal and the notes but not on a slide. Put its measurements in the appendix beside the distroless comparison, for the question "wouldn't `golang:latest` do the same?"

**What we did.**
- **Counted the builder's CVEs by fix state,** from step 13's recorded report (`reports/after/builder-golang-grype.json`, Grype database built 16 November 06:30 UTC). A CVE counts as fixed if any of its matches has a fix.
- **The deck:** a new appendix slide 44, "chainguard/go against golang:latest, measured", after slide 43 (distroless).
  - Ten rows from step 13: the builders' digests, Go, the binary, the final images, the builders' CVEs, KEV, packages, size, tools, user and shell.
  - A panel, "Why the builder matters, when what ships is the same": where a build runs, the CVE a severity filter would hide, the choice of builder.
  - Notes: what to say, where the numbers come from, likely questions.
- **Renumbered:** appendix slides 44 to 56 became 45 to 57 (CVE priority is now 46; the screenshot slides 53 to 57), and the shown deck is 57 slides. The index slide, the notes and the console's triage label (`20, 46`) follow.
- **Pointers:** slides 12 and 17's notes name slide 44; slide 43's build-stage row says "(next slide)".

**What came out.**

| `golang:latest` as a builder | CVE IDs |
|---|---|
| Critical · High · Medium · Low · Negligible · Unknown | 10 · 68 · 73 · 21 · 140 · 13 |
| A fix exists | 3 |
| Debian won't fix | 150 |
| No fix yet | 172 |
| **Total** | **325** |

`chainguard/go` as a builder: 0.

**Surprises.** None.

**Findings.** None new; F22 gains the fix states.

**Decisions.**
- **After slide 43, renumbered.** Base and builder comparisons sit together. The slide-number tokens moved every reference in the notes; the one console label was updated by hand.

**Evidence.** `logs/30-builder-slide.log`; `demo/screenshots/30-builder-cves-by-fix-state.png`; `reports/after/builder-cg-go-grype.json`, `builder-golang-grype.json`; the deck's slide 44.

## Step 31 · Getting into D, which has no shell, and the side door it opens
**Run in:** the build VM (recorded in `logs/31-debug-d.log`), the Mac (the console) · **Evidence:** `tools/debug-d.sh`, `demo/screenshots/31-debug-*.png`

**Goal.** The panel may ask how to get into image D when it has no shell, in Docker and on Kubernetes. Show it without changing D, under the cluster's own rules, and put it on the console's slide tabs.

**What we did.**
- **The debug image:** Chainguard's `busybox`, pinned by digest (`63f6bae4…`). Its signature verified against Chainguard's release workflow; it runs as 65532, D's user; it has `sh`, `ps`, `ls`, `cat` and `netstat`, but no `wget`, `curl` or `nc` (surprise 57).
- **`tools/debug-d.sh`,** three modes:
  1. `docker`: `docker exec` fails; busybox shares D's process and network namespaces with no added capabilities; `docker cp` copies the binary out.
  2. `k3s`: `kubectl exec` fails; `kubectl debug --target=hello --profile=restricted` adds busybox to one D pod; then that pod is deleted, and the deployment replaces it from the same signed digest.
  3. `gap`: unsigned C as a new pod (restricted settings, so only the signature policy decides), then as a debug container; then the pod is deleted.
- **The console:**
  - `/present`, tab "Images A, B, C and D": "Get into D without a shell (Docker)".
  - Tab "k3s pulls the digest I signed": "Get into D on k3s: kubectl debug, restricted" and "The side door: an unsigned image as a debug container", each with a replay screenshot.
  - Three quick answers for the command deck: `q-debug-d`, `q-k-debug-d`, `q-k-debug-gap`. The quick answers are now 110.
  - All three were run from the page before recording: green, green, and a red card for the side door.
- **`-dev`:** checked which tags exist (surprise 58): `chainguard/static:latest-dev` doesn't; `chainguard/go:latest-dev` does.
- **Screenshots:** the lab's tmux window had stayed 164 columns wide while the Terminal showed 96, which cut long lines off in earlier screenshots. `tmux resize-window -A` fitted it to 96, so lines now wrap.

**What came out.**

| | Docker | k3s |
|---|---|---|
| Shell into D | `exec: "sh": executable file not found` | the same, from `kubectl exec` |
| Debug container | busybox as 65532, no added capabilities | busybox as 65532, admitted with `allowPrivilegeEscalation=false`, `drop=ALL`, `runAsNonRoot=true` |
| What it sees | `hello-server` as PID 1; D's 20,222,796-byte binary through `/proc/1/root`; `:::8080` listening | the same |
| Afterwards | the throwaway container removed; `docker cp` copied 20,222,796 bytes | the pod deleted and replaced; debug containers left: 0 |

**The side door:** unsigned C was refused as a pod ("The image must be signed with the lab key (cosign.pub)") and admitted as a debug container, where it started and logged `Listening and serving HTTP on :8080`, then `bind: address already in use`.

**Tags:** `static:latest` `fc42af33…`; `static:latest-dev` no such tag; `go:latest` `504c1cce…` (rebuilt since D pinned `64c93a14…`); `go:latest-dev` `b873b09c…`; `busybox:latest` `63f6bae4…`.

**Surprises.** 56, 57 and 58 (above).

**Findings.** F32: debug containers get past the signature policy.

**Decisions.**
- **Debug the running digest, don't rebuild it.** A debug container brings the tools to D and leaves with the pod; a `-dev` or debug build would be a different digest, unsigned by the lab key and carrying a shell. `chainguard/static` has no `-dev` tag in any case.
- **Clean up by replacing the pod.** A debug container can't be removed from a pod, so each k3s test deletes the pod it used; the deployment brings a fresh one from the same signed digest.
- **Record the side door, don't fix it yet.** The fix (the policy covering debug containers, or RBAC on who can add them) is untested; F32 stays open.

**Evidence.** `logs/31-debug-d.log`; `tools/debug-d.sh`; screenshots `31-debug-busybox-verified.png`, `31-debug-d-docker.png`, `31-debug-d-k3s.png`, `31-debug-gap.png`, `31-debug-dev-tags.png`.

## Step 32 · The Kubernetes manifests, on a slide and checked against the cluster
**Run in:** the build VM (recorded in `logs/32-manifests.log`), the Mac (the deck and the console) · **Evidence:** `tools/check-manifests.sh`, `demo/screenshots/32-manifests-*.png`

**Goal.** The brief lists "Create Kubernetes manifests", but no slide showed them: slide 22 shows what they do, slide 23 names the files, and a hidden practice table lists the settings. Put D's two manifests on one appendix slide, line by line, check that the cluster runs exactly them, and give the console a button that prints them.

**What we did.**
- **Listed the manifests in the repo,** by kind: D's Deployment and Service in `k8s/` (45 and 13 lines); hello-ai's Deployment and Service in `ci/hello-ai/k8s/`; the Kyverno `ImageValidatingPolicy` in `ci/hello-ai/policy/`.
- **Checked the files against the cluster,** without changing anything:
  - a server-side dry run, then `kubectl diff`;
  - the image digest in the file, in the cluster and on `hello:d` in the registry, and `cosign verify` of that digest with the lab key;
  - what isn't in the files: the namespace's Pod Security labels, and the pods behind the Service.
- **`tools/check-manifests.sh`** runs those checks; `show` prints the two files with line numbers first.
- **The deck:** a new appendix slide 52, "The Kubernetes manifests, line by line", after the supply-chain table (51).
  - Both files as in the repo, with `cat -n`'s line numbers (comments left out, the digest shortened): the Deployment and its pod (lines 4 to 27), the container (28 to 45), the Service (2 to 13).
  - Each line coloured by what it's for: green, the four settings the restricted level requires; cyan, hardening added that it doesn't require; pink, D by its signed digest; the rest is structure.
  - Under them, the checks from this step, and the other three manifests in the repo.
  - Notes: what to say, where the numbers come from, likely questions. Slide 22's notes point to it.
- **Renumbered:** appendix slides 52 to 57 became 53 to 58 (operations is now 53; the screenshot slides 54 to 58), and the shown deck is 58 slides, 80 in all. The index slide and the notes follow; the console's k3s tab is labelled `22, 52`.
- **The console:**
  - `/present`, tab "k3s pulls the digest I signed": "D's manifests match what the cluster runs", with two replay screenshots.
  - The quick answer "D's manifests, and whether the cluster matches them" (`q-k-manifest-d`), which prints both files, then the checks. The quick answers are now 111.
  - Both were run from the page: green.

**What came out.**

| Check | Result |
|---|---|
| Server-side dry run | `deployment.apps/hello unchanged`, `service/hello unchanged` |
| `kubectl diff -f k8s/` | exit 0, no difference |
| The digest | `sha256:c5ce9ddb…7270a08` in the file, in the cluster and on `hello:d` |
| Its signature | `cosign verify` with the lab key: exit 0 |
| Not in the files | `pod-security.kubernetes.io/enforce=restricted` and `warn=restricted`, labels on the namespace |
| The Service's endpoints | the two `hello` pods, both ready |

| Lines in `k8s/deployment.yaml` | Settings |
|---|---|
| Required by the restricted level | `runAsNonRoot: true`; `seccompProfile` `RuntimeDefault`; `allowPrivilegeEscalation: false`; `capabilities` `drop: ["ALL"]` |
| Added, not required | `automountServiceAccountToken: false`; `runAsUser` and `runAsGroup` 65532; `readOnlyRootFilesystem: true`; CPU and memory requests and limits |
| Pinned | `image: 192.168.252.2:5000/hello@sha256:c5ce9ddb…` |

**Surprises.** None.

**Findings.** None new.

**Decisions.**
- **Show the files, not a summary.** The slide quotes the manifests line for line, so the panel sees what the cluster runs, and the colours do the explaining. Comments are left out and the digest is shortened to fit; the console prints the files in full.
- **After slide 51, renumbered.** The manifests sit with the supply-chain evidence. The slide-number tokens moved every reference in the notes.
- **Checks that change nothing.** A dry run and `kubectl diff` compare the files with the cluster without applying them.

**Evidence.** `logs/32-manifests.log`; `tools/check-manifests.sh`; screenshots `32-manifests-match-cluster.png` and `32-manifests-namespace-service.png`; the deck's slide 52.

## Step 33 · Inspect and describe: image D, its container and its pod, on the console
**Run in:** the build VM (recorded in `logs/33-inspect.log`), the k3s VM from the Mac (`logs/33-inspect-mac.log`), the Mac (the console) · **Evidence:** the two logs, `demo/screenshots/33-*.png`

**Goal.** The console had `docker image inspect` and `kubectl get` only for chosen fields. Add the commands a panelist may ask for by name: the full image inspect, a running container inspected, `kubectl describe`, and the live object as YAML.

**What we did.**
- **Ran each in the lab session first,** then added it as a quick answer:
  - "D: docker image inspect, in full" (`q-inspect-d`, group "Images, digests and layers").
  - "Run D and inspect the container: user, capabilities, seccomp" (`q-inspect-run-d`, "Run it"): a throwaway container, its `docker inspect` security fields, and its process's status from the VM's `/proc`; then the container is removed.
  - "kubectl describe: one D pod" (`q-k-describe-d`, "Kubernetes").
  - "D's Deployment as the cluster holds it (YAML)" (`q-k-yaml-d`, "Kubernetes"): `kubectl get deploy hello -o yaml`, with the one-line JSON copy of the applied file (the `last-applied-configuration` annotation) left out, and the output says so.
- **Traced D's Author and labels** to its base: `crane config` of the pinned `static` digest against `docker image inspect hello:d`.
- **Compared with the cluster:** the same `/proc` fields for D's two processes on the k3s node.
- **The console:** 115 quick answers (114 on `/present`; its README still said 106, now corrected). All four were run from `/present` and are on `/deck`.
- **Screenshots,** taken after the commit, from reruns of the same commands (the last one shows only the key lines): the running container, D's labels traced to its base, and the pod's describe with the Deployment's server-filled defaults.

**What came out.**

D as an image (`docker image inspect hello:d`): ID `sha256:c5ce9ddb…`, the signed digest; user `65532`; entrypoint `/usr/local/bin/hello-server`; `GIN_MODE=release`; arm64; two layers; `Author: github.com/chainguard-dev/apko` and 8 labels, all from `static` (surprise 59, F33).

| Process status | D under `docker run`, Docker's defaults | D on k3s, the manifest's settings |
|---|---|---|
| Uid, Gid | 65532, 65532 | 65532, 65532 |
| CapEff (capabilities in effect) | 0 | 0 |
| CapBnd (the ceiling on what it could gain) | `a80425fb`: Docker's default 14 | 0 (`drop: ["ALL"]`) |
| NoNewPrivs | 0 | 1 (`allowPrivilegeEscalation: false`) |
| Seccomp | 2, filtering (Docker's default profile) | 2, filtering (`RuntimeDefault`) |
| Read-only root filesystem | no (`ReadonlyRootfs: false`) | yes (step 19, `crictl inspect`) |

`kubectl describe` of one D pod: the Image ID is the signed digest; `SeccompProfile: RuntimeDefault`; `Mounts: <none>` (no API token, from `automountServiceAccountToken: false`); QoS class `Burstable` (requests below limits); both probes; no events (they expire after an hour).

The live Deployment: `revision: "1"` and `generation: 1`, so unchanged since step 19. The server filled in what the file leaves out: a rolling-update strategy (25% surge, 25% unavailable), `progressDeadlineSeconds: 600`, `revisionHistoryLimit: 10`, probe timings (every 10 s, a 1 s timeout, 3 failures), `restartPolicy: Always`, `terminationGracePeriodSeconds: 30`.

**Surprises.** 59 (above).

**Findings.** F33: D's labels describe its base image.

**Decisions.**
- **Leave D's labels for now.** New labels change D's digest, which is scanned, signed and deployed; F33 records the fix.
- **Raw output, one line shortened.** The answers print what the tools print; only the YAML's one-line JSON copy of the file is left out.

**Evidence.** `logs/33-inspect.log`; `logs/33-inspect-mac.log`; screenshots `33-inspect-container-d.png`, `33-inspect-d-labels-from-base.png` and `33-describe-and-live-yaml.png`; `demo/console/actions/shortcuts.js`.

## Step 34 · Six more answers for what the panel may ask to see live
**Run in:** the build VM (recorded in `logs/34-live-asks.log`), the Mac (the console) · **Evidence:** the log, `demo/screenshots/34-*.png`

**Goal.** Comparing the console's 115 answers with what a panel is likely to ask for live left six gaps: a scan of an image customers use against Chainguard's, D's logs in the cluster, a pod killed and replaced, resource use, whether D's dependencies are current today, and where Chainguard's side records a fix. Add each, tested.

**What we did.**
- **Ran each in the lab session first,** then added it as a quick answer:
  - "nginx against Chainguard's nginx, live: CVEs and size" (`q-scan-nginx`, "Scan it live"): Grype on Docker Hub's `nginx:latest` and `cgr.dev/chainguard/nginx:latest`, straight from the registries (`registry:`, nothing kept in Docker), with the recorded database (`GRYPE_DB_AUTO_UPDATE=false`, `--by-cve`); compressed size from each manifest.
  - "Where Wolfi records a fix: Rapid Reset in its security feed" (`q-wolfi-secdb`, "Scan it live"): Wolfi's `security.json`, both IDs for Rapid Reset.
  - "D's modules and Go: the newest today?" (`q-mod-current`, "Dockerfiles and source"): `go list -m -u` on the 19 modules compiled into D, the same lookup for the Gin in A to C as a control, and the Go that built D (`go version` on its binary) against go.dev's latest.
  - "D's logs in the cluster" (`q-k-logs-d`, "Kubernetes").
  - "Delete a D pod and watch it come back" (`q-k-kill-d`, "Kubernetes"): changes the cluster on purpose; the deployment replaces the pod from the same signed digest.
  - "Resource use: kubectl top, and docker stats on the VM" (`q-k-top`, "Kubernetes").
- **The first nginx run printed a package count of 0 for both images:** Grype's JSON has no package list, so that field was wrong. Replaced with the OS Grype detected, and run again.
- **The console:** 121 quick answers (120 on `/present`). All six were run from `/present`; the console README lists them, and notes the third answer that deletes a pod.

**What came out.**

| Answer | Result |
|---|---|
| nginx against Chainguard's | `nginx:latest` (Debian 13.7): 220 unique CVE IDs, 73 critical or high, 59 MB compressed. `cgr.dev/chainguard/nginx:latest` (Wolfi): 0 and 0, 6 MB. Grype database built 16 November; 25 to 40 s for both |
| Wolfi's feed | 1,472 packages. Rapid Reset: CVE-2023-44487 lists a fixing version for 82 packages (`cosign 2.2.0-r6`, `grype 0.72.0-r1`, `nghttp2 1.57.0-r0`), 0 for 3; Go's ID for it, CVE-2023-39325, for 110 (`go-1.20 1.20.10-r0`, `go-1.21 1.21.3-r0`, `k3s 1.28.2-r1`) |
| D's dependencies today | 19 modules, none with a newer version; the control, Gin v1.8.1, shows v1.12.0; D's Go 1.27.4 is go.dev's latest stable |
| D's logs | a request to `/` every 10 s per probe, from 10.42.0.1 (the node); 0 lines from Gin's debug mode in either pod |
| Delete a D pod | replaced, with two ready pods and the old one gone, by the first check 2 s after the delete; the same digest |
| Resource use | each D pod 1 to 2m CPU and 1 to 3 MiB, against limits of 200m and 64 MiB; hello-ai's Python pods 41 and 56 MiB; the k3s node at 70 to 73% of its memory |

**Surprises.** 60 (above).

**Findings.** None new.

**Decisions.**
- **nginx for the comparison.** The image most customers know, with a free Chainguard equivalent; scanned from the registries so nothing stays on the VM's disk, which is 84% used.
- **The recorded Grype database.** The comparison uses the same database as every other number in the lab; "D against today's Grype database" exists for today's.
- **A control for "none".** The dependency check also looks up an old Gin, so "none" can't be a failed lookup.

**Evidence.** `logs/34-live-asks.log`; screenshots `34-scan-nginx-vs-chainguard.png`, `34-wolfi-feed-rapid-reset.png`, `34-modules-and-go-current.png`, `34-delete-pod-replaced.png`, `34-resource-use.png`; `demo/console/actions/shortcuts.js`.

## Step 35 · The deck catches up: steps 31 to 34, and what F32 changes
**Run in:** the Mac (the deck, which is outside the repo) · **Evidence:** the deck's slides 15, 22, 41, 51, 53 and 54, and their notes

**Goal.** Steps 31, 33 and 34 were in the journal and the console but barely in the deck, and finding F32 contradicted lines in it: several slides and notes said the cluster refuses anything unsigned, while a debug container got an unsigned image in. Bring the deck up to date, so every claim in it holds.

**What we did.**
- **Searched the deck,** slides and notes, for each step's topics, and for every claim that only signed images run.
- **F32 caveats,** eleven places: "only signed images run" became "in pods" where that's the claim, and F32 is named where the claim was "anything" or "whatever goes around the pipeline".
  - Slides: 41 (Kyverno's job), 51 (the admission policy's gap now names F32), 53 (two operations rows), and a hidden practice table.
  - Notes: slides 3, 22, 31, 32, 51 and 58 (the screenshot slide of the cluster refusing), and a hidden practice slide.
- **Steps 31 and 33 in the notes:**
  - Slide 15 (image C), "In the lab, for D": `docker exec` failing, what the busybox debug container saw, no `-dev` tag for `static`, Docker's defaults against the manifest's settings, and F33.
  - Slide 22 (k3s), "Debugging D on the cluster, and the side door it opened" and "Inspected live", plus a likely question: "Can an unsigned image still run in your cluster?"
- **A new appendix slide 54, "What I can show live, and what it showed":** eleven likely "show me" questions, each with its result from 17 November and the console answer that runs it. The index slide has a row for it.
- **Renumbered:** the screenshot slides 54 to 58 became 55 to 59; the shown deck is 59 slides, 81 in all.
- **Checked:** the text of every slide and its notes compared with the deck before, so only these changes appear; slides 39, 51, 53 and 54 rendered and read; PowerPoint opens it with 81 slides.

**What came out.** The deck covers steps 30 to 34, and no line in it says unsigned images can't run without the pod qualifier or F32.

**Surprises.** None.

**Findings.** None new.

**Decisions.**
- **Qualify, don't drop.** The policy does refuse unsigned pods, and the bypass test proves it; the caveat says where that stops, rather than removing the claim.
- **One slide for the live answers.** A table of question, result and console answer is what's needed under pressure: one place to find what to click.

**Evidence.** The deck (`Chainguard-SE-Challenge-Deck.pptx`, outside the repo; the one before is kept as `deck-backups/…-before-step35.pptx`).

## Step 36 · Chainguard Libraries for Go: what it is, how D would use it, and the cooldown
**Run in:** the build VM (recorded in `logs/36-libraries.log`), the Mac (Chainguard's docs, the deck's notes) · **Evidence:** the log, `demo/screenshots/36-module-dates-cooldown.png`

**Goal.** An email from Chainguard said the free Starter plan now includes Chainguard Libraries, Go among them. Check whether that means Libraries for Go is out of beta, confirm whether D used it, and prepare the answers: how D's Dockerfile would use it, how to know it serves every module D needs, how the cooldown works, and whether Chainguard patches Go modules itself.

**What we did.**
- **Read Chainguard's pages** on 17 November: the Libraries introduction (updated 12 November), the Go overview (14 October), the Go build-configuration and migration guides (21 October), the plans page (10 November), the repositories page (12 November), the Go product page, and the announcement "Chainguard Libraries expands to Go and .NET" (14 October).
- **Checked where D's modules came from:** no `GOPROXY` in `Dockerfile.d-patched`, none in the `go` image's environment (`GODEBUG GOTOOLCHAIN PATH SSL_CERT_FILE`), so Go's default, `https://proxy.golang.org,direct`.
- **Dated D's 19 module versions** with `go list -m -f '{{.Time}}'` (the dates the Go proxy reports), to see what a 7-day cooldown would hold back.
- **The deck's notes:** slide 27 has a block, "Chainguard Libraries for Go, if asked", and two likely questions: whether Chainguard patches a Go module itself, and how D would change. The answers on slides 4 and 27 gained a sentence each. Slide 31's answer was wrong: it said Libraries controls "where the bytes come from rather than how old they are", but Libraries has its own cooldown. It now says so.
- Nothing in D, the cluster or the console changed.

**What came out.**

| Question | Answer, from Chainguard's pages |
|---|---|
| Out of beta? | No. The docs say beta, the product page early access and a Technology Preview (surprise 61). Starter includes it: modules malware-scanned, a 7-day cooldown, 50,000 pulls a month, no CVE-remediated versions (those are on Team) |
| Did D use it? | No. Chainguard's `go` image supplied the compiler; the modules came from `proxy.golang.org` |
| Where packages come from | Chainguard rebuilds Java, Python and JavaScript libraries from verified source, where the source is available and the license allows it. Anything else comes from the public registry unchanged, through upstream fallback (on by default), after malware and greyware scanning and the cooldown. Go modules are source, so they're proxied, not rebuilt. Not a complete mirror |
| The cooldown | Counted from the version's upstream publication date; 7 days by default (fixed at 7 on Starter, 0 to 7 on Team, longer on Enterprise). With upstream fallback on, it covers Chainguard-built and upstream packages alike. A held version is left out of version lists, and asking for it fails (npm 403; others not found). Malware scanning applies even with no cooldown |
| Does Chainguard patch Go modules itself? | Both ways. A fix upstream has released is served after the cooldown, and you upgrade. For a version you can't move off, Chainguard backports critical and high fixes and publishes them as, for example, `v1.1.2-cgr.1`, a pre-release between v1.1.1 and v1.1.2, adopted with a `replace` directive. Go remediation is in beta |
| D through Chainguard | `GOPROXY=https://libraries.cgr.dev/go` (no fallback), `GONOSUMDB=*`, and the pull token as a BuildKit secret on `go mod download`; `go.sum` still pins the bytes. Not built: it needs a pull token |
| Would it serve all of D's modules today? | No: 18 of 19 are older than 7 days; `golang.org/x/crypto v0.59.0` is dated 11 November, so on Starter it isn't served until about 18 November, and the build would fail on it (F34) |

**Surprises.** 61 (above).

**Findings.** F34: D's module update skipped the lab's own 7-day cooldown.

**Decisions.**
- **Don't switch D.** A different module source means a rebuild, rescan, new signature and new deployment; every recorded digest would move. The Dockerfile change is in the notes, ready to say.
- **Correct slide 31, not just add to it.** Its answer understated Libraries; the panel would know.

**Evidence.** `logs/36-libraries.log`; `demo/screenshots/36-module-dates-cooldown.png`; `logs/13-image-d.log` (the `go get -u` of 16 November); the deck's slides 4, 27 and 31.

## Step 37 · Image D split in two: D, the dependency update, and E, the app fixed
**Run in:** the build VM (recorded in `logs/37-image-e.log`), the Mac (the console, the deck, the reports) · **Evidence:** the log, `demo/screenshots/37-*.png`, `reports/final/d-*` and `e-*`

**Goal.** Image D changed three things at once: a current Go, updated modules, and three fixes to the app's own code and settings. Split it, so the images change one thing each again, and so the deck can show that a clean scan doesn't mean a safe app: D with only the dependency update, E with the fixes as well. Today's D already is that E, so keep its digest and everything attached to it, and build only the new D.

**What we did.**
- **Retagged today's D as E,** locally (`hello:e`, `hello:e-golang`) and in the registry (`crane tag … e`): the same digest, `c5ce9ddb…7270a08`. Its signature verifies on the new tag, and `kubectl diff` stays at no difference: the cluster wasn't touched.
- **Built the new D:** `go-updated/` holds E's `go.mod` and `go.sum` and the original `main.go`; `Dockerfile.d-updated` is E's Dockerfile without `ENV GIN_MODE=release`. Pushed to the registry, unsigned. `Dockerfile.d-patched` became `Dockerfile.e-patched` and `Dockerfile.d-golang` became `Dockerfile.e-golang`, with their headers rewritten; only comments changed.
- **Scanned D** with the databases the final rescan used (Grype built 16 November 06:30, Trivy 16 November 07:10, both checked first), and gave it an SBOM. E's 24 report, SBOM, signing and provenance files were renamed from `d-` to `e-`; the new `d-` files are D's.
- **D against E, live:** the logs after a forged `X-Forwarded-For`, half a request header, and what changed from C to D and from D to E (`tools/show-fixes.sh`, now D against E).
- **The tools** follow five images: `results.sh` (and the tables in README and REPORT), `comparison.py`, `make-showcase.sh`; `check-manifests.sh` reads `hello:e`; `debug-d.sh` became `debug-e.sh`. `sync-to-mac.sh` now skips files deleted in the working tree, after the showcase links it replaced stopped a sync.
- **The console:** every answer and proof read by meaning (the dependency update is D; the code fixes, signature, deployment, debugging and inspection are E). Five new answers (Dockerfile E, D to E, build E live, run E, verify D: never signed) and a new proof, "D and E: the same scan, a different app". 126 answers (125 on `/present`). The changed answers were run on the VM and the changed sections from the page; "Call E in the cluster" was made robust against a port still closing from the run before.
- **The deck** (kept outside the repo): five images on slides 5, 12, 17 and 19; slide 18 is now "Image E: fix what no scanner sees", built from this step's screenshots; slide 21 shows E passing verification and D and C failing. Every other slide and the speaker notes were read by meaning, as the console was. The appendix gives E its own column where the numbers differ (findings, scanners, where they differ) and puts D and E together where they are the same (Dockerfiles, SBOM).
- **The Word reports** (also outside the repo) regenerated from REPORT.md, JOURNAL.md, `results.json` and the deck's tables: five images, this step's test and signature screenshots, and a note that E was called D until step 37. They were last generated at step 29, so they now carry steps 30 to 36 as well.
- **The run sheet** (`demo/demo.md`) and two lines of REPORT.md that still said "four images" corrected.
- **Cleaned up:** the tag `hello:d-golang` removed (the image stays as `hello:e-golang`).

**What came out.**

| | D | E |
|---|---|---|
| Digest | `76eb535b…`, new | `c5ce9ddb…`, unchanged since step 13 |
| Source | `go-updated/`: updated `go.mod`, original `main.go` | `go-patched/`: the same `go.mod`, patched `main.go` |
| Grype, Trivy (unique CVE IDs) | 0, 0 | 0, 0 |
| govulncheck, binary and source | no vulnerabilities | no vulnerabilities |
| SBOM | 25 packages, 21 Go | 25 packages, 21 Go |
| Binary | 20,238,499 bytes | 20,222,796 bytes |
| Startup log | Gin's debug-mode and "trusted all proxies" warnings | request lines only |
| Forged `X-Forwarded-For: 203.0.113.9` | logged as the client | logged from the real source, 172.17.0.1 |
| Half a request header | still open after 10 s | closed after 5 s |
| Signed | no: `cosign verify` exit 10, "no signatures found"; the cluster refuses it | yes, verified |

A rebuild of D with no cache gives the same binary (`sha256 1f8cd33d…` both times).

**Surprises.** 62 (above): running the console's rescan proof updated the shared scanner databases.

**Findings.** None new; F1, F2 and F8 now read "Fixed in E", and D keeps them.

**Decisions.**
- **Retag, don't rebuild, E.** Its digest is what was scanned, signed, attested and deployed; a rebuild would move every one of those.
- **D unsigned, never deployed.** It exists to be compared with E, and the cluster refusing it is part of the point.
- **Rename E's artifacts, keep the history.** Files describing digest `c5ce9ddb…` are named `e-` now; logs, screenshots and journal entries of steps 13 to 36 stay as recorded, with the naming note at the top.

**Evidence.** `logs/37-image-e.log`; screenshots `37-d-vs-e-source.png`, `37-d-vs-e-log.png`, `37-d-vs-e-timeout.png`, `37-c-to-d-to-e-versions.png`, `37-d-unsigned-refused.png`, `37-d-and-e-same-scan.png`, `37-images-a-to-e.png`, `37-results-five-images.png`, `37-sign-e-passes-c-d-fail.png`; `reports/final/d-*`, `sbom/d.*`.

## Step 38 · Ready for any day: Grype's age check, and disk space for the live database
**Run in:** the build VM (recorded in `logs/38-live-ready.log`), the Mac (the console and the deck) · **Evidence:** the log

**Goal.** A final check before the talk found two things that would break live answers. Grype refuses a database more than 5 days old by default (`max-allowed-built-age: 120h`), and the console's live scans use the recorded database, built 2026-11-16 06:30 UTC, so from 2026-11-21 06:30 UTC every one of them would fail. And the answer that downloads today's Grype database needs 4,000,000 KB free; the VM had 3,924,028.

**What we did.**
- **Proved the override first,** with the expiry simulated by a 1-hour limit (`GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1h`): without it, `grype hello:e` exits 1, "the vulnerability database was built 1 day ago (max allowed age is 1 hour)"; with `GRYPE_DB_VALIDATE_AGE=false`, exit 0 and no findings.
- **The console:** the eight live Grype scans that use the recorded database (seven quick answers and the proof "Rescan D and E now") now set `GRYPE_DB_VALIDATE_AGE=false` beside `GRYPE_DB_AUTO_UPDATE=false`. "E against today's Grype database" downloads its own and needs neither. Restarted the console.
- **Ran them with the 1-hour limit still set:** Grype on D and E, no vulnerabilities; all five images 734, 161, 69, 0 and 0; C 69 from the image and 158 from its SBOM; `grype explain` on Rapid Reset. All exit 0, the same numbers as the deck. "Rescan D and E now", run from `/present`: D and E 0 in Grype, Trivy and govulncheck.
- **Disk:** `docker builder prune -f` removed 317.7 MB of unused build cache; free space went from 3,924,028 to 4,234,532 KB. No image was touched.
- **The deck** (outside the repo): slide 37's live command and its "Before the call" card, and the notes of slides 2, 19 and 37, now keep the recorded databases instead of updating them that morning.
- **The same database everywhere:** `gate.sh` runs Grype with automatic updates, in the same cache, so any pipeline run (the live demo, or warming the caches) would have replaced the recorded database with that day's. The VM user's `~/.config/grype/config.yaml` now sets `auto-update: false` and `validate-age: false` for every Grype run by that user: the runner's jobs (it runs as `ubuntu`, `HOME=/home/ubuntu`), the Git hook, the warm-up and the console. `grype config --load` shows both from the lab repo, the `hello-ai` clone and `/tmp`. The console's "E against today's Grype database" sets `GRYPE_DB_AUTO_UPDATE=true` for its own cache in `/tmp`; an environment variable wins over the file.
- **Checked with the warm-up gate** (`GATE_COMMIT=warmup000000 ./gate.sh` in `~/hello-ai`): all seven checks passed, and the database stayed as it was: built 2026-11-16 06:30 UTC, the same file, size (3,445,293,056 bytes) and inode. A run through GitHub Actions was not triggered; the runner reads the same file.

**Decisions.**
- **Keep the recorded database for live scans,** so they reproduce the deck's numbers; turning the age check off is what keeps that possible after 21 November. Today's data stays one answer away.
- **The pipeline uses the recorded database too,** so the live demo can't change the numbers the console shows afterwards. The cost: the gate judges hello-ai against data from 16 November; for a real pipeline the database is updated on a schedule, not frozen.

## Step 39 · The Dockerfiles in full, and the agent's skills on the production slides
**Run in:** the Mac (the console, the deck and the reports), the build VM (the new tool) · **Evidence:** `tools/show-dockerfile.sh`, `demo/console/actions/present.js`

**Goal.** Make every image's Dockerfile easy to show in full, everywhere the work is presented, and put the agent's own supply chain (step 24) on the slides that describe the pipeline.

**What we did.**
- **A small read-only tool, `tools/show-dockerfile.sh a|b|c|d|e`:** one image's Dockerfile with its line numbers, a `>` on each instruction that isn't in the image before it. It marks 0, 5, 1, 2 and 1 lines for A to E: B's second stage, user and entrypoint; C's runtime `FROM`; D's builder `FROM` and `GOTOOLCHAIN=local`; E's `GIN_MODE=release`.
- **The presentation page:** a new section, "The Dockerfiles, A to E", one proof per image, each running the tool live with what changed and what ships. A file only read has no screenshot, so replay runs it live too.
- **The deck** (outside the repo): one appendix slide per Dockerfile (60 to 64), the file as in the repo with the changed instructions in green; the hidden practice slides moved to 65 to 86. The production slides now show the agent's skills: slide 25 adds an eighth card, "AI agents in the pipeline"; slides 29 to 31 add the skill gate (SkillSpector, step 24) and Chainguard's Agent Skills (beta).
- **The Word reports** (outside the repo): the full report's Appendix B gives each Dockerfile in full after the side-by-side table; the executive edition gains a chapter with each file's instructions.

## Step 40 · "What went wrong": three lessons a customer would hit
**Run in:** the Mac (the console and the deck) · **Evidence:** `demo/console/actions/present.js`

**Goal.** Slide 26 told three stories; two were about the lab's own setup rather than securing images: Docker's provenance naming the wrong commit (F24) and the pipeline gate hiding a build error (F29). Keep the scanner lesson, and replace those two with lessons from the same evidence that matter to a team running images.

**What we did.**
- **The deck** (outside the repo), slide 26: "Two scanners, two counts" stays; "No base reaches the binary" (the standard library and every module are compiled into the binary, so B to C left its 69 CVEs untouched, the same file in A, B and C; A's extra 27 standard-library IDs came from the Go tools A ships, surprise 13); and "Signed isn't enforced" (unsigned C ran until a policy checked, F26; a debug container still gets past it, F32). The provenance and gate stories stay in the notes as answers.
- **The presentation page:** the proof for that section now checks the three lessons, read-only: the gap analysis line from REPORT.md, the app binary's hash in B and C with each image's CVEs by layer, cosign verify on C, the policy in the cluster, and F32's status.

**What came out.** From the page: binary `ec6fa6de…` in B and C; OS 603, 92 and 0, standard library 87, 60 and 60; C "no signatures found"; the policy `require-lab-signature`; debug containers still open.

## Step 41 · Image D still runs after the update
**Run in:** the build VM, in the recorded session · **Evidence:** `logs/41-d-runs.log`, `demo/screenshots/41-d-runs-curl.png`

**Goal.** The deck showed D's new Go and modules and its scan, but nothing showed D running. Show that the dependency update alone (Go 1.27.4, Gin 1.12.0, `main.go` as delivered) still starts and answers.

**What we did.** Three recorded commands: `docker image ls hello:d`; `go version` and `go version -m` on the binary copied out of D (`docker create` and `docker cp`, since D has no shell); `docker run` on port 18081, `curl -si`, Gin's log line, then `docker stop` (started with `--rm`, so no container is left).

**What came out.** `hello:d` is `76eb535bcdcd`, 34.9MB; its binary is `go1.27.4` with `github.com/gin-gonic/gin v1.12.0`; it answered `HTTP/1.1 200 OK`, `Content-Length: 12`, `Hello World!`, and Gin logged `200 | … | 172.17.0.1 | GET "/"`. In the deck (outside the repo) as a new slide after "Image D: a current Go, current dependencies".

## Step 42 · govulncheck on each app binary, for the deck
**Run in:** the build VM, in the recorded session · **Evidence:** `logs/42-govulncheck.log`, `demo/screenshots/42-govulncheck-binaries.png`

**Goal.** The step 09 screenshot of govulncheck is a 225-column summary, unreadable on a slide. Show the run itself, on every app binary, in one legible screen, for the slide that explains why the work after C moved to Go and `go.mod`.

**What we did.** `sha256sum` on the binaries copied out of A, B and C; `govulncheck -version`; then `govulncheck -mode binary` on `hello-server-b` (Go 1.18.10), `hello-server-newgo` (the same code built with Go 1.27.4 at step 12), `hello-server-d` and `hello-server-e`. Checked, unrecorded, that `hello-server-d` has the same SHA-256 as the binary copied out of `hello:d` at step 41.

**What came out.** One hash for A, B and C, `ec6fa6de…`. govulncheck v1.9.0 with the database updated 2026-11-11, the same database as the recorded runs, so the results match them: B 62 ("from 2 modules and the Go standard library"), the newer-Go rebuild 11 ("from 1 module"), D and E "No vulnerabilities found". In the deck (outside the repo) as a new slide after "What a base image can fix, and what it can't".

## Step 43 · How old Go and every module were, and what each carried
**Run in:** the build VM, in the recorded session · **Evidence:** `logs/43-module-ages.log`, `tools/module-ages.py`

**Goal.** Show, module by module, why D moved to Chainguard's current Go and updated every module: each version in the binary A, B and C ship, the date it was published, the version in D, and the CVEs each scanner reports in it.

**What we did.** Wrote `tools/module-ages.py` (read-only): versions from `go version -m` on `hello-server-b` and `hello-server-d`; module dates from `proxy.golang.org` through `go list -m`; Go's release dates from go.dev's release history; CVEs per package from `reports/final` (Grype and Trivy on C, which ships the same binary, and govulncheck on the binary), with KEV from the saved catalog. Ran it once, recorded.

**What came out.** Go 1.18.10, released 2023-01-10 (Go 1.18 reached end of life on 2023-02-01, F4), against Go 1.27.4, released 2026-11-10. All 15 modules were published between 2019-06-02 (`gin-contrib/sse` v0.1.0) and 2022-06-06 (Gin v1.8.1), 4 to 7½ years before this step; D's versions are from 2026. The CVEs sit in four places: the standard library (Grype 60, Trivy 104, govulncheck 49), `x/net` (14, 29, 12, with Rapid Reset on KEV), `x/text` (2, 4, 1) and Gin (1, 2, 0). Trivy alone also reports `x/crypto` 26, `x/sys` 2 and `protobuf` 1; nine modules have no known CVE. In the deck (outside the repo) as a new slide after "What a base image can fix, and what it can't".
