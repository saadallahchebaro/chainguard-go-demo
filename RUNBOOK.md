# Runbook

Every command that worked, in order, ready to copy. Mistakes and dead ends stay in `logs/` and `JOURNAL.md`.

---

## 00 · Prepare the Mac

**Goal:** install Multipass, create the private GitHub repo, check the Mac is ready.
**Runs on:** the Mac · **Log:** `logs/00-prepare-mac.log` · **Produces:** the empty private repo on GitHub

```bash
# Install Multipass; the installer asks for your Mac password (it adds the multipassd service)
brew install --cask multipass

# Client and service both answer: expect "multipass 1.17.1+mac" and "multipassd 1.17.1+mac"
multipass version

# Create the private repo with the personal account, then switch gh back to the work account
gh auth switch -h github.com -u saadallahchebaro
gh repo create saadallahchebaro/chainguard-technical-challenge --private --description "Chainguard SE technical challenge lab"
gh repo view saadallahchebaro/chainguard-technical-challenge --json nameWithOwner,visibility,url
gh auth switch -h github.com -u <your-work-account>   # back to the account used for other work

# Readiness: CPUs and memory, free memory, free disk, Docker Desktop closed, Multipass driver
echo "macOS $(sw_vers -productVersion) on $(uname -m), $(sysctl -n hw.ncpu) CPUs, $(( $(sysctl -n hw.memsize) / 1073741824 )) GB RAM"
memory_pressure | tail -1
df -h ~ | tail -1
pgrep -fl 'Docker.app' || echo 'Docker Desktop: not running'
multipass get local.driver
```

**Expect:** "multipass was successfully installed!", `"visibility":"PRIVATE"`, driver `qemu`.
**If it goes wrong:** if `multipass version` says it can't connect to the socket, the service is still starting. Wait a few seconds and run it again.

---

## 01 · Create the build VM, clone the repo, load the recorder

**Goal:** the brief's Linux VM, with the challenge repo cloned into it, pointed at your private repo, and recording every command.
**Runs on:** the Mac, then the VM · **Logs:** `logs/01-vm-mac.log`, `logs/01-vm.log`
**Produces:** the VM `chainguard`; the repo with `upstream` and `origin`; `tools/`; the first commit on GitHub

**On the Mac:**
```bash
# The build VM: Ubuntu 24.04, 4 CPUs, 4 GB, 30 GB (first run downloads the image)
multipass launch 24.04 --name chainguard --cpus 4 --memory 4G --disk 30G
multipass info chainguard

# Recorder, tmux settings and the one-time setup script; the script starts the tmux session "lab"
multipass transfer tools/labrc.sh chainguard:/home/ubuntu/.labrc.sh
multipass transfer tools/tmux.conf chainguard:/home/ubuntu/.tmux.conf
multipass transfer tools/bootstrap-vm.sh chainguard:/home/ubuntu/bootstrap-vm.sh
multipass exec chainguard -- bash /home/ubuntu/bootstrap-vm.sh
```

**To open the session (and reconnect any time), from a Terminal window on the Mac:**
```bash
multipass shell chainguard
tmux attach -t lab
```

**On the VM, in the session:**
```bash
git clone https://github.com/maligin/chainguard-technical-challenge && cd chainguard-technical-challenge
step 01-vm

# The challenge repo becomes "upstream"; your private repo is "origin"
git remote rename origin upstream
git remote add origin git@github.com:saadallahchebaro/chainguard-technical-challenge.git

# Folders, and the recorder moved into the repo (~/.labrc.sh links to it)
mkdir -p dockerfiles reports/before reports/after reports/final sbom k8s demo/screenshots tools
mv ~/.labrc.sh tools/labrc.sh && ln -s ~/chainguard-technical-challenge/tools/labrc.sh ~/.labrc.sh
mv ~/bootstrap-vm.sh tools/ && cp ~/.tmux.conf tools/tmux.conf

# Commit identity for this repo only: the GitHub noreply address
git config user.name "Saadallah Chebaro"
git config user.email "84092091+saadallahchebaro@users.noreply.github.com"

# Deploy key: can push to this one repo only
ssh-keygen -q -t ed25519 -N "" -C "chainguard build VM deploy key" -f ~/.ssh/chainguard_deploy
cat ~/.ssh/chainguard_deploy.pub
printf "Host github.com\n  IdentityFile ~/.ssh/chainguard_deploy\n  IdentitiesOnly yes\n" >> ~/.ssh/config && chmod 600 ~/.ssh/config

# GitHub's host key, then its fingerprint: compare with the Mac command below before connecting
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
ssh-keygen -lf ~/.ssh/known_hosts
```

**On the Mac:** check the fingerprint, then register the public key on the repo with write access.
```bash
gh api meta --jq .ssh_key_fingerprints.SHA256_ED25519     # must match the VM's line for github.com
multipass transfer chainguard:/home/ubuntu/.ssh/chainguard_deploy.pub ./chainguard_deploy.pub
gh auth switch -h github.com -u saadallahchebaro
gh repo deploy-key add ./chainguard_deploy.pub --allow-write --title "chainguard build VM" -R saadallahchebaro/chainguard-technical-challenge
gh auth switch -h github.com -u <your-work-account>   # back to the account used for other work
```

**Back on the VM:**
```bash
ssh -T git@github.com     # "Hi saadallahchebaro/chainguard-technical-challenge! ..." (exit code 1 is normal)
git add -A && git commit -m "step 00-01: lab setup, recorder and documents"
git push -u origin main
```

**Expect:** "Launched: chainguard"; the prompt shows `[01-vm]` after `step 01-vm`; the host key fingerprints match; the push creates `main` on your repo.
**If it goes wrong:**
- **The first boot sits at "Starting" with no IP.** Check `cat /var/db/dhcpd_leases` on the Mac for the VM's address, then `nc -z -v <ip> 22`. Here, VPN and security agents slowed the boot, but it finished.
- **Typed keys are swallowed by tmux, with "not in a mode".** The pane was in scroll mode. Run `tmux copy-mode -q -t lab` first.

---

## 02 · Install Docker Engine

**Goal:** Docker Engine from Docker's own repository, usable by `ubuntu` without `sudo`, proven with `hello-world`.
**Runs on:** the VM · **Log:** `logs/02-docker.log` · **Screenshots:** `02-docker-hello-world.png`, `02-docker-version-storage.png`

```bash
step 02-docker

# Prerequisites, then Docker's signing key; check the fingerprint before trusting it
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
gpg --show-keys --with-fingerprint /etc/apt/keyrings/docker.asc   # expect 9DC8 5822 9FC7 DD38 854A  E2D8 8D81 803C 0EBF CD88

# Docker's repository file: the guide writes these six lines with a heredoc; this one-liner writes the same file
printf "Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n" \
  "$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")" "$(dpkg --print-architecture)" \
  | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
cat /etc/apt/sources.list.d/docker.sources

# Install Docker Engine, the CLI, containerd and the buildx and compose plugins
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Use Docker without sudo: effectively root on this machine (the daemon runs as root)
sudo usermod -aG docker $USER
getent group docker && ls -l /var/run/docker.sock
id; docker ps        # still "permission denied": the group applies to new logins only
```

**Log in again so the shell gets the group.** In a plain shell: `exit`, then `multipass shell chainguard`. For the tmux session, restart it from a fresh login (on the Mac), then reconnect with `tmux attach -t lab`:
```bash
multipass exec chainguard -- tmux kill-server
multipass exec chainguard -- bash /home/ubuntu/chainguard-technical-challenge/tools/bootstrap-vm.sh
```

```bash
cd ~/chainguard-technical-challenge && step 02-docker
id && docker run --rm hello-world     # id now lists 988(docker); "Hello from Docker!"
docker version
docker info | grep -E 'Server Version|Storage Driver|driver-type|Docker Root Dir|Cgroup|Security Options|apparmor|seccomp|Kernel|Architecture'
docker images && docker system df && sudo du -sh /var/lib/containerd /var/lib/docker
```

**Screenshot (on the Mac):** `bash tools/shot.sh 02-docker-hello-world` captures the Terminal window showing the session.

**Expect:** Docker 29.9.3; `driver-type: io.containerd.snapshotter.v1`; `hello-world` prints "Hello from Docker!"
**If it goes wrong:** `permission denied … docker.sock` after `usermod` means the shell started before the group change. Log in again.

---

## 03 · Install the tools

**Goal:** Go, govulncheck, crane, kubectl, cosign, Grype and Syft, each verified before it's installed.
**Runs on:** the VM · **Log:** `logs/03-tools.log` · **Screenshots:** `03-tools-*.png`

```bash
step 03-tools
mkdir -p ~/downloads && cd ~/downloads

# Go: newest release, verified against go.dev's published SHA-256
export GOV=$(curl -s "https://go.dev/VERSION?m=text" | head -1)      # go1.27.4 here
curl -sSfLO "https://go.dev/dl/$GOV.linux-arm64.tar.gz"
curl -s "https://go.dev/dl/?mode=json" | jq -r --arg f "$GOV.linux-arm64.tar.gz" \
  '.[].files[] | select(.filename == $f) | .sha256 + "  " + .filename' > go.sha256
sha256sum -c go.sha256                                               # "OK"
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf $GOV.linux-arm64.tar.gz
go version                  # PATH comes from tools/labrc.sh (/usr/local/go/bin and ~/go/bin)

# govulncheck and crane, built from source into ~/go/bin
go install golang.org/x/vuln/cmd/govulncheck@latest
go install github.com/google/go-containerregistry/cmd/crane@latest

# kubectl, verified against dl.k8s.io's SHA-256
KV=$(curl -Ls https://dl.k8s.io/release/stable.txt)
curl -sSfLO "https://dl.k8s.io/release/$KV/bin/linux/arm64/kubectl"
curl -sSfLO "https://dl.k8s.io/release/$KV/bin/linux/arm64/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c
sudo install -m 0755 kubectl /usr/local/bin/kubectl

# cosign, verified against its release checksums (integrity only: same source as the binary)
curl -sSfLO https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-arm64
curl -sSfLO https://github.com/sigstore/cosign/releases/latest/download/cosign_checksums.txt
grep " cosign-linux-arm64$" cosign_checksums.txt | sha256sum -c
sudo install -m 0755 cosign-linux-arm64 /usr/local/bin/cosign

# Grype and Syft: read Anchore's installers first, then run them with -v (cosign signature check)
curl -sSfL https://get.anchore.io/grype -o grype-install.sh
curl -sSfL https://get.anchore.io/syft -o syft-install.sh
grep -n -E "hash_sha256_verify\(\)|verify-blob|certificate-identity|certificate-oidc-issuer|v\) VERIFY_SIGN" grype-install.sh
grep -n -B3 -A12 "fetching release script" grype-install.sh     # it downloads and runs the release's own install.sh
sudo sh grype-install.sh -v -b /usr/local/bin
sudo sh syft-install.sh -v -b /usr/local/bin

# Verify the installed binaries ourselves: signature on checksums, archive checksum, installed = archived
export T=grype V=0.121.3          # then repeat with: export T=syft V=1.57.1
U=https://github.com/anchore/$T/releases/download/v$V
curl -sSfLO $U/${T}_${V}_linux_arm64.tar.gz -O $U/${T}_${V}_checksums.txt -O $U/${T}_${V}_checksums.txt.sigstore.json
cosign verify-blob ${T}_${V}_checksums.txt --bundle ${T}_${V}_checksums.txt.sigstore.json \
  --certificate-identity "https://github.com/anchore/$T/.github/workflows/release.yaml@refs/heads/main" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com          # "Verified OK"
sha256sum -c --ignore-missing ${T}_${V}_checksums.txt                            # archive "OK"
tar -xzf ${T}_${V}_linux_arm64.tar.gz $T && sha256sum $T /usr/local/bin/$T       # the two hashes must match

# Versions, on one screen
cd ~/chainguard-technical-challenge
go version; govulncheck -version | head -2; echo "crane $(crane version)"; kubectl version --client | head -1
cosign version | grep GitVersion; grype version | grep -E "^(Application|Version):"; syft version | grep -E "^(Application|Version):"; docker --version
```

**Expect:** each check prints "OK" or "Verified OK", and for Grype and Syft the two `sha256sum` lines match.
**If it goes wrong:** a failed checksum or signature means: don't install. Download again and check again; if it still fails, find out why before going on.

---

## 04 · Verify Trivy, then install it

**Goal:** install Trivy only after cosign proves Aqua's release workflow signed this exact release.
**Runs on:** the VM · **Log:** `logs/04-trivy.log` · **Screenshots:** `04-trivy-verified.png`, `04-trivy-installed.png`

```bash
step 04-trivy
cd ~/downloads

# Newest release; must never be 0.69.4, 0.69.5 or 0.69.6 (the compromised ones)
export TV=$(curl -s https://api.github.com/repos/aquasecurity/trivy/releases/latest | jq -r .tag_name | sed 's/^v//')
echo $TV                                                    # 0.76.2 here

# The package and its Sigstore bundle
curl -sSfLO "https://github.com/aquasecurity/trivy/releases/download/v${TV}/trivy_${TV}_Linux-ARM64.deb" \
  -O "https://github.com/aquasecurity/trivy/releases/download/v${TV}/trivy_${TV}_Linux-ARM64.deb.sigstore.json"

# Verify: signer = Aqua's release workflow at this exact tag, via GitHub's OIDC issuer
cosign verify-blob trivy_${TV}_Linux-ARM64.deb --bundle trivy_${TV}_Linux-ARM64.deb.sigstore.json \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity "https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v${TV}"
                                                            # "Verified OK"

# Optional: the same check with the wrong tag is refused (shows the certificate records the tag)
cosign verify-blob trivy_${TV}_Linux-ARM64.deb --bundle trivy_${TV}_Linux-ARM64.deb.sigstore.json \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity "https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.1"
                                                            # error: expected SAN value "...v0.76.1", got "...v0.76.2"

# Install the file that was verified, then confirm
sudo apt-get install -y ./trivy_${TV}_Linux-ARM64.deb
trivy --version && dpkg -s trivy | grep -E "^(Package|Version|Maintainer):"
```

**Expect:** "Verified OK"; Trivy 0.76.2, maintainer Aqua Security.
**If it goes wrong:** if verification fails with the correct tag, don't install. Check the version and the identity string first; the identity must match the workflow and tag exactly.

---

## 05 · Record the versions, then run the app as delivered

**Goal:** every tool's version on record; the original app built with Go 1.18 and answering on the VM.
**Runs on:** the VM · **Logs:** `logs/05-versions.log`, `logs/05-sanity.log` · **Screenshots:** `05-*.png`

```bash
step 05-versions
bash tools/versions.sh          # one line per tool

step 05-sanity
cd go
# Build with Go 1.18 in a throwaway container; the binary lands in go/ (and belongs to root)
docker run --rm -e CGO_ENABLED=0 -v "$PWD":/src -w /src golang:1.18 go build -o hello-server .
```

**If the build can't resolve `proxy.golang.org`** (`lookup … on <gateway>:53: i/o timeout`), containers can't reach a working DNS server. Diagnose, then give Docker DNS servers that answer:
```bash
grep nameserver /etc/resolv.conf; resolvectl dns                       # what the VM uses
docker run --rm golang:1.18 cat /etc/resolv.conf                       # what a container gets
dig +time=2 +tries=1 +short @192.168.252.1 proxy.golang.org             # timed out here
dig +time=2 +tries=1 +short @1.1.1.1 proxy.golang.org                   # answered
echo '{ "dns": ["1.1.1.1", "8.8.8.8"] }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
docker run --rm golang:1.18 sh -c "grep nameserver /etc/resolv.conf; getent hosts proxy.golang.org"
```

```bash
# Run it on the VM and curl it (in tmux: split the window, server left, curl right)
./hello-server                  # left pane: Gin warns about debug mode and trusting all proxies
curl -s -i localhost:8080       # right pane: HTTP/1.1 200 OK ... Hello World!
# Ctrl-C stops the server
ls -l hello-server              # owner root:root, because the container ran as root
cd ..
```

**Expect:** "Hello World!" with status 200, and Gin's two warnings.
**If it goes wrong:** "address already in use" means another `hello-server` is still running: stop it first.

**How old is the toolchain?** (the evidence behind findings F3–F6)
```bash
docker image inspect golang:1.18 --format "image built: {{.Created}}"                  # 2023-01-11
docker run --rm golang:1.18 sh -c "go version; grep PRETTY_NAME /etc/os-release"        # go1.18.10, Debian 11
curl -s "https://go.dev/dl/?mode=json" | jq -r '[.[].version] | join(", ")'            # supported Go versions
(cd /tmp && go list -m -json github.com/gin-gonic/gin@v1.8.1 github.com/gin-gonic/gin@latest | jq -r '"gin " + .Version + "  released " + .Time')
curl -s https://endoflife.date/api/go.json | jq -r '.[] | select(.cycle=="1.18") | "Go 1.18 end of life " + .eol'
curl -s https://endoflife.date/api/debian.json | jq -r '.[] | select(.cycle=="11") | "Debian 11 security support ended " + .support + ", LTS ended " + .eol'
```

---

## 06 · Look inside the app before packaging it

**Goal:** read the code and dependencies, see the binary as scanners do, confirm it's static, and keep a pristine copy.
**Runs on:** the VM · **Log:** `logs/06-app.log` · **Screenshots:** `06-app-*.png`

```bash
step 06-app

# The code and its dependencies
cat -n go/main.go
cat go/go.mod
echo "direct: $(grep -c '^require github' go/go.mod)  indirect: $(grep -c '// indirect' go/go.mod)  go.sum lines: $(wc -l < go/go.sum)"

# The build record inside the binary: what Grype and Trivy read
go version -m go/hello-server
go version -m go/hello-server | grep -c '^\sdep'          # 15 modules compiled in (go.mod lists 19)

# Evidence from Gin v1.8.1's source and Go's docs
curl -s https://raw.githubusercontent.com/gin-gonic/gin/v1.8.1/gin.go | sed -n '372,384p'      # Run() -> http.ListenAndServe
go doc net/http.Server | grep -B6 'ReadHeaderTimeout time.Duration'                        # zero = no timeout
for f in json.go jsoniter.go go_json.go; do printf '%-12s ' $f; curl -s https://raw.githubusercontent.com/gin-gonic/gin/v1.8.1/internal/json/$f | grep -m1 '^//go:build'; done

# Static build?
file go/hello-server        # "statically linked"
ldd go/hello-server         # "not a dynamic executable"

# Pristine copy for image D's changes
cp -r go go-patched && rm -f go-patched/hello-server
diff -r --exclude=hello-server go go-patched && echo identical

cat go/.gitignore           # melange and apko outputs
```

**Expect:** go1.18.10 with 15 `dep` lines; "statically linked"; `diff` prints nothing.

---

## 07 · Image A: single-stage on golang:1.18

**Goal:** build the baseline image and see everything it ships.
**Runs on:** the VM · **Log:** `logs/07-image-a.log` · **Screenshots:** `07-image-a-*.png` · **Produces:** `dockerfiles/Dockerfile.a-single`, image `hello:a`

```bash
step 07-image-a
rm -f go/hello-server                    # keep the build context to source only
cat -n dockerfiles/Dockerfile.a-single
docker build --progress=plain -t hello:a -f dockerfiles/Dockerfile.a-single ./go

# Index and sizes (Docker 29 adds a provenance attestation by default)
docker image ls --tree hello:a
sudo ctr -n moby content get sha256:<index digest from the build output> \
  | jq -c '.manifests[] | {platform: (.platform.os + "/" + .platform.architecture), type: .annotations["vnd.docker.reference.type"]}'
docker images | grep -E '^(IMAGE|golang|hello)'          # DISK USAGE and CONTENT SIZE

# Run checks
docker run -d -p 8080:8080 --name hello-a hello:a
curl -s localhost:8080                                     # Hello World!
docker image inspect hello:a --format '{{.Config.User}}'   # empty = root
docker exec hello-a id                                     # uid=0(root)
docker exec hello-a sh -c 'echo shell works'
docker logs hello-a

# What else it ships
docker exec hello-a grep PRETTY_NAME /etc/os-release
docker exec hello-a dpkg-query -W | wc -l                  # 201 packages
docker exec hello-a sh -c 'for t in go gcc git make curl wget apt-get perl python3 ssh; do printf "%-8s %s\n" $t $(command -v $t || echo -); done'
docker exec hello-a ls -la /app
docker exec hello-a du -sh /go/pkg/mod /usr/local/go
docker history --format '{{.Size}}\t{{.CreatedSince}}\t{{.CreatedBy}}' hello:a | cut -c1-150

docker rm -f hello-a
```

**Expect:** Hello World!; root; a shell; about 1.5 GB on disk.

---

## 08 · Image B: multi-stage onto debian:trixie-slim

**Goal:** ship only the binary on a current slim base as a non-root user, and measure the difference from A.
**Runs on:** the VM · **Log:** `logs/08-image-b.log` · **Screenshots:** `08-image-b-*.png` · **Produces:** `dockerfiles/Dockerfile.b-multi`, `tools/compare.sh`, image `hello:b`

```bash
step 08-image-b
cat -n dockerfiles/Dockerfile.b-multi
docker build --progress=plain -t hello:b -f dockerfiles/Dockerfile.b-multi ./go     # build stage: CACHED

# Sizes, and the two bases
docker images | grep -E '^(IMAGE|golang|debian|hello:)'
for i in golang:1.18 debian:trixie-slim; do printf "%-20s built %s  " $i "$(docker image inspect $i --format '{{.Created}}' | cut -c1-10)"; docker run --rm $i grep PRETTY_NAME /etc/os-release; done

# Run checks (port 8081, so A to D can run side by side)
docker run -d -p 8081:8080 --name hello-b hello:b
curl -s localhost:8081                                       # Hello World!
docker image inspect hello:b --format '{{.Config.User}}'     # 65532
docker exec hello-b id                                       # uid=65532 gid=0(root): the gotcha
docker exec hello-b sh -c 'grep -c 65532 /etc/passwd'        # 0: not in passwd

# What it ships
docker exec hello-b dpkg-query -W | wc -l                    # 78
docker exec hello-b sh -c 'for t in go gcc git make curl wget apt-get perl python3 ssh; do printf "%-8s %s\n" $t $(command -v $t || echo -); done'
docker exec hello-b sh -c 'ls -l /usr/local/bin/; ls -d /app /go'
docker history --format '{{.Size}}\t{{.CreatedSince}}\t{{.CreatedBy}}' hello:b | cut -c1-150

# A and B side by side
bash tools/compare.sh hello:a hello:b

docker rm -f hello-b
```

**Expect:** Hello World!; `uid=65532 gid=0(root)`; about 155 MB on disk; 78 packages.
**If it goes wrong:** `docker image inspect debian:trixie-slim` may say "No such image" right after the build. BuildKit doesn't register base images by name; `docker pull debian:trixie-slim` first.

---

## 09 · Scan images A and B

**Goal:** both scanners on A and B, every report as JSON, SARIF and a table, with versions and database dates recorded.
**Runs on:** the VM · **Log:** `logs/09-scan-ab.log` · **Screenshots:** `09-scan-*.png` · **Produces:** `reports/before/*`, `tools/count.sh`

```bash
step 09-scan-ab

# Fresh databases, then record versions and dates
grype db update && grype db status
trivy image --download-db-only && trivy version
{ echo "Scan of images A and B, $(date -u +%FT%TZ)"; bash tools/versions.sh; grype db status; trivy version; } > reports/before/scanner-versions.txt

# Grype: table, JSON and SARIF from one run
for i in a b; do grype hello:$i --by-cve -o table=reports/before/$i-grype.txt -o json=reports/before/$i-grype.json -o sarif=reports/before/$i-grype.sarif; done

# Trivy: one scan to JSON, then convert (same result in all three formats)
for i in a b; do
  trivy image --no-progress --format json --output reports/before/$i-trivy.json hello:$i
  trivy convert --format table --output reports/before/$i-trivy.txt reports/before/$i-trivy.json
  trivy convert --format sarif --output reports/before/$i-trivy.sarif reports/before/$i-trivy.json
done

bash tools/count.sh reports/before/{a,b}-{grype,trivy}.json

# Check the numbers that look odd
jq -r '[.matches[] | select(.artifact.type=="binary") | "\(.artifact.name) \(.artifact.version)"] | group_by(.) | map("\(length)  \(.[0])")[]' reports/before/a-grype.json
jq '[.matches[] | select(.artifact.name=="stdlib" and .artifact.locations[0].path=="/app/hello-server") | .vulnerability.id] | unique | length' reports/before/a-grype.json   # 60 = B's
jq -r '[.Results[]? | select(.Type=="debian") | .Vulnerabilities[]? | {p: .PkgName, id: .VulnerabilityID}] | unique | group_by(.p) | map("\(length)  \(.[0].p)")[]' reports/before/a-trivy.json | sort -rn | head -5
grype config | grep -B1 match-upstream-kernel-headers

# The app on its own
grype dir:./go --by-cve -o table=reports/before/src-grype.txt -o json=reports/before/src-grype.json -o sarif=reports/before/src-grype.sarif
(cd go && govulncheck ./...) > reports/before/govulncheck-source.txt
docker create --name tmp-b hello:b && docker cp tmp-b:/usr/local/bin/hello-server ./hello-server-b && docker rm tmp-b
govulncheck -mode binary ./hello-server-b > reports/before/govulncheck-binary-b.txt

# B's Critical findings
grep -w Critical reports/before/b-grype.txt

# Big reports: the repo keeps gzip copies; the raw files are .gitignore'd
gzip -k -9 -f reports/before/a-grype.json reports/before/a-trivy.json reports/before/a-trivy.sarif
```

**Expect:** Grype A 734 / B 161 unique IDs; Trivy A 10,856 / B 253 (with this database date; numbers move as databases update).
**Reading a compressed report:** `zcat reports/before/a-grype.json.gz | jq '.matches | length'`

---

## 10 · Make sense of the results

**Goal:** explain the scanner differences with evidence, then rank what matters by KEV, reachability, EPSS and severity.
**Runs on:** the VM · **Log:** `logs/10-triage.log` · **Screenshots:** `10-triage-*.png` · **Produces:** `tools/gap-analysis.sh`, `tools/triage.sh`, `reports/before/cisa-kev.json`, `reports/before/govulncheck-*.json`

```bash
step 10-triage

# Per module: Grype on the binary, Trivy on the binary, Grype on go.mod
R=reports/before
for m in github.com/gin-gonic/gin golang.org/x/crypto golang.org/x/net golang.org/x/sys golang.org/x/text google.golang.org/protobuf; do
  printf "%-28s %3s %3s %3s\n" $m \
    $(jq "[.matches[]|select(.artifact.name==\"$m\")|.vulnerability.id]|unique|length" $R/b-grype.json) \
    $(jq "[.Results[]?.Vulnerabilities[]?|select(.PkgName==\"$m\")|.VulnerabilityID]|unique|length" $R/b-trivy.json) \
    $(jq "[.matches[]|select(.artifact.name==\"$m\")|.vulnerability.id]|unique|length" $R/src-grype.json)
done

# Is a record in Grype's database? (search by CVE and by its GHSA/GO aliases)
grype db search --vuln CVE-2023-29401;  grype db search --vuln GHSA-2c4m-59x9-fr2g

# Is the vulnerable function compiled in?
go tool nm ./hello-server-b | grep -c -F 'gin.(*Context).FileAttachment'      # 0
go tool nm ./hello-server-b | grep -c -F 'gin.(*Engine).Run'                  # >0

# Grype's rule, in its source at the version we ran
curl -s https://raw.githubusercontent.com/anchore/grype/v0.121.3/grype/pkg/qualifier/gosymbols/qualifier.go | grep -A3 'Satisfied reports whether'

# Classify every Trivy-only Go ID
bash tools/gap-analysis.sh ./hello-server-b $R/b-grype.json $R/b-trivy.json

# Triage inputs: CISA's KEV catalog, govulncheck JSON for the binary and the source
curl -sSfL https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json -o $R/cisa-kev.json
govulncheck -mode binary -format json ./hello-server-b > $R/govulncheck-binary-b.json
(cd go && govulncheck -format json ./...) > $R/govulncheck-source.json

# Ranked: KEV, then in binary, then EPSS, then severity
bash tools/triage.sh $R/b-grype.json $R/cisa-kev.json $R/govulncheck-binary-b.json $R/govulncheck-source.json 12
bash tools/triage.sh $R/a-grype.json $R/cisa-kev.json $R/govulncheck-binary-b.json $R/govulncheck-source.json 12

# Is HTTP/2 actually exposed?
docker run -d -p 8081:8080 --name hello-b hello:b
curl -s -o /dev/null -w "%{http_version}\n" --http2-prior-knowledge localhost:8081   # refused
curl -s -o /dev/null -w "%{http_version}\n" --http2 localhost:8081                   # 1.1
docker rm -f hello-b
```

**Expect:** Grype 17 vs Trivy 64 module IDs, almost all explained by functions not compiled in; Rapid Reset at the top of B's ranking.

---

## 11 · Image C: Chainguard's static as the runtime base

**Goal:** one change from B: the runtime base becomes `cgr.dev/chainguard/static`, pinned by digest and verified.
**Runs on:** the VM · **Log:** `logs/11-image-c.log` · **Screenshots:** `11-image-c-*.png` · **Produces:** `dockerfiles/Dockerfile.c-chainguard`, image `hello:c`, `reports/after/c-*`

```bash
step 11-image-c

# Pin the base by digest, and verify Chainguard's signature on that digest
export SD=$(crane digest cgr.dev/chainguard/static:latest)
crane manifest cgr.dev/chainguard/static@$SD | jq -c '.manifests[] | {platform: (.platform.os + "/" + .platform.architecture), digest}'
cosign verify cgr.dev/chainguard/static@$SD \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main

# The one-line difference from B (comment lines removed), then build
diff <(grep -v '^#' dockerfiles/Dockerfile.b-multi) <(grep -v '^#' dockerfiles/Dockerfile.c-chainguard)
docker build --progress=plain -t hello:c -f dockerfiles/Dockerfile.c-chainguard ./go

# Same binary in A, B and C?
docker create --name tmp-a hello:a && docker cp tmp-a:/app/hello-server ./hello-server-a && docker rm tmp-a
docker create --name tmp-c hello:c && docker cp tmp-c:/usr/local/bin/hello-server ./hello-server-c && docker rm tmp-c
sha256sum hello-server-a hello-server-b hello-server-c

# Run checks (port 8082)
docker run -d -p 8082:8080 --name hello-c hello:c
curl -s localhost:8082
docker exec hello-c id; docker exec hello-c sh -c 'echo shell'     # both fail: no such executables
ps -o uid,gid,args -C hello-server                                  # 65532 65532
docker cp hello-c:/etc/passwd - | tar -xO | grep nonroot
docker export hello-c | tar -t | grep -v '/$' | wc -l               # 1254 files

# Scan, list OS packages, compare
grype hello:c --by-cve -o table=reports/after/c-grype.txt -o json=reports/after/c-grype.json -o sarif=reports/after/c-grype.sarif
trivy image --no-progress --format json --output reports/after/c-trivy.json hello:c
trivy convert --format table --output reports/after/c-trivy.txt reports/after/c-trivy.json
trivy convert --format sarif --output reports/after/c-trivy.sarif reports/after/c-trivy.json
syft hello:c -q -o json | jq -r '.artifacts[] | select(.type=="apk") | .name + " " + .version'
bash tools/count.sh reports/after/c-grype.json reports/after/c-trivy.json
bash tools/compare.sh hello:a hello:b hello:c

docker rm -f hello-c
```

**Expect:** cosign "Verified"; identical hashes; 19 MB; OS CVEs 0; Go CVEs unchanged (60 + 17 with Grype).

---

## 12 · Does today's Go build the untouched code?

**Goal:** build `go/`, unchanged, with the current Go; run it; measure what a compiler upgrade alone changes.
**Runs on:** the VM · **Log:** `logs/12-newgo.log` · **Screenshots:** `12-newgo-*.png`

```bash
step 12-newgo
(cd go && CGO_ENABLED=0 go build -o ../hello-server-newgo .)     # Go 1.27.4; exit 0
git status --short go/                                          # nothing: go/ untouched
(./hello-server-newgo &); sleep 2; curl -s localhost:8080; pkill -f hello-server-newgo

# Same modules, different Go
go version hello-server-b hello-server-newgo
diff <(go version -m hello-server-b | grep -P '^\tdep') <(go version -m hello-server-newgo | grep -P '^\tdep')

# What the compiler upgrade alone removes
grype file:./hello-server-newgo --by-cve -o json=reports/after/newgo-binary-grype.json -o table=reports/after/newgo-binary-grype.txt
govulncheck -mode binary ./hello-server-newgo > reports/after/govulncheck-binary-newgo.txt
bash tools/count.sh reports/after/c-grype.json reports/after/newgo-binary-grype.json
```

**Expect:** builds and answers; standard-library CVEs 60 → 0; govulncheck reachable 62 → 11.

---

## 13 · Image D: the patched app, built with a current Go

**Goal:** update the dependencies, fix F1, F2 and F8 in the code and configuration, build with `cgr.dev/chainguard/go` on C's runtime base, test, scan, compare A to D.
**Runs on:** the VM (`main.go` and the two Dockerfiles are written on the Mac and copied in) · **Log:** `logs/13-image-d.log`, `logs/13-image-d-mac.log` · **Screenshots:** `13-image-d-*.png` · **Produces:** `go-patched/` changes, `dockerfiles/Dockerfile.d-patched`, `dockerfiles/Dockerfile.d-golang`, images `hello:d` and `hello:d-golang`, `reports/after/d-*`, `d-golang-*`, `builder-*`, `govulncheck-*-d.txt`

```bash
step 13-image-d

# 1. Update the dependencies (go-patched/ starts as an exact copy of go/)
cd go-patched
diff -r ../go . && echo "exact copy"
go get -u ./...
go mod tidy
git diff --no-index ../go/go.mod go.mod                         # the go.mod change, for a slide
go mod graph | grep " go@" | sort -V -k2 | tail -4               # who sets the go line: gin-contrib/sse, 1.26.10
reqs() { go mod edit -json "$1" | jq -r '.Require[] | .Path + " " + .Version' | sort; }
join -a1 -a2 -e "(none)" -o 0,1.2,2.2 <(reqs ../go/go.mod) <(reqs go.mod) | column -t     # before/after table
go mod why -m github.com/quic-go/quic-go go.mongodb.org/mongo-driver/v2 github.com/goccy/go-yaml github.com/gabriel-vasile/mimetype

# 2. Patch main.go (SetTrustedProxies(nil); an http.Server with timeouts), then check it
git diff --no-index ../go/main.go main.go
gofmt -l .                                                       # lists nothing
go vet ./...

# 3. Scan the source, build and run locally
govulncheck ./... > ../reports/after/govulncheck-source-d.txt    # No vulnerabilities found
CGO_ENABLED=0 go build -o ../hello-server-d-local .
cd ..
(./hello-server-d-local &); sleep 2; curl -s localhost:8080; pkill -f hello-server-d-local
(GIN_MODE=release ./hello-server-d-local &); sleep 2; curl -s localhost:8080; pkill -f hello-server-d-local

# 4. Prove the code fixes: the original binary (A, B, C) against the patched one
for b in hello-server-b hello-server-d-local; do                 # forged client IP: what does Gin log?
  (GIN_MODE=release ./$b &); sleep 2
  curl -s -o /dev/null -H "X-Forwarded-For: 203.0.113.9" localhost:8080; sleep 1; pkill -f $b; sleep 1
done
for b in hello-server-b hello-server-d-local; do                 # half-sent request header: does the server hang up?
  (GIN_MODE=release ./$b &); sleep 2; s=$(date +%s)
  exec 3<>/dev/tcp/127.0.0.1/8080; printf "GET / HTTP/1.1\r\nHost: localhost\r\n" >&3
  timeout 15 cat <&3; [ $? = 124 ] && echo "still open after 15 s" || echo "closed after $(( $(date +%s) - s )) s"
  exec 3>&-; pkill -f $b; sleep 1
done

# 5. Pin and verify the builder; read its Go version and GOTOOLCHAIN
export GD=$(crane digest cgr.dev/chainguard/go:latest)
cosign verify cgr.dev/chainguard/go@$GD \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main
crane config --platform linux/arm64 cgr.dev/chainguard/go@$GD | jq '.created, .config.User, .config.Env'
docker run --rm cgr.dev/chainguard/go@$GD version               # go1.27.4: at least go.mod's 1.26.10

# 6. Build D: three instruction lines differ from C
diff <(grep -v '^#' dockerfiles/Dockerfile.c-chainguard) <(grep -v '^#' dockerfiles/Dockerfile.d-patched)
docker build --progress=plain -t hello:d -f dockerfiles/Dockerfile.d-patched ./go-patched
docker images hello

# 7. Run checks (port 8083), including both code fixes against the container
docker run -d -p 8083:8080 --name hello-d hello:d
curl -s localhost:8083
docker exec hello-d id; docker exec hello-d sh -c 'echo shell'      # both fail: no such executables
ps -o uid,gid,args -p $(docker inspect -f '{{.State.Pid}}' hello-d)  # 65532 65532
curl -s -o /dev/null -H "X-Forwarded-For: 203.0.113.9" localhost:8083; docker logs hello-d   # logged from 172.17.0.1
# then the half-sent header test from part 4, against port 8083: closed after 5 s

# 8. The binary: Go version and modules compiled in
docker cp hello-d:/usr/local/bin/hello-server ./hello-server-d
go version hello-server-b hello-server-d
deps() { go version -m "$1" | awk '$1=="dep" {print $2}' | sort; }
comm -3 <(deps hello-server-b) <(deps hello-server-d)            # 5 added, 1 gone

# 9. Scan on the same databases as A, B and C, then check what the scanners saw
export GRYPE_DB_AUTO_UPDATE=false
grype hello:d --by-cve -o table=reports/after/d-grype.txt -o json=reports/after/d-grype.json -o sarif=reports/after/d-grype.sarif
trivy image --skip-db-update --format json --output reports/after/d-trivy.json hello:d
trivy image --skip-db-update --format table --output reports/after/d-trivy.txt hello:d    # convert writes nothing at zero (surprise 26)
trivy convert --format sarif --output reports/after/d-trivy.sarif reports/after/d-trivy.json
govulncheck -mode binary ./hello-server-d > reports/after/govulncheck-binary-d.txt
{ echo; echo "Scan of image D, $(date -u +%FT%TZ) (database updates off: the same databases as image C)"; echo; bash tools/versions.sh | grep -E "grype|trivy|syft"; grype db status | grep -E "Schema|Built"; trivy version | grep -E "UpdatedAt"; } >> reports/after/scanner-versions.txt
syft hello:d -q -o json | jq -r '.artifacts | group_by(.type)[] | .[0].type + ": " + (length | tostring)'    # apk 3, go-module 21
jq -r '.Results[] | .Target + ": " + ((.Packages // []) | length | tostring) + " packages, " + ((.Vulnerabilities // []) | length | tostring) + " vulnerabilities"' reports/after/d-trivy.json
bash tools/count.sh reports/after/d-grype.json reports/after/d-trivy.json
bash tools/compare.sh hello:a hello:b hello:c hello:d

# 10. Optional: the same build on Docker's golang:latest, and both builders scanned
export GL=$(crane digest golang:latest)
docker build -t hello:d-golang -f dockerfiles/Dockerfile.d-golang ./go-patched      # only the builder FROM differs
id=$(docker create hello:d-golang); docker cp $id:/usr/local/bin/hello-server ./hello-server-d-golang; docker rm $id
diff <(go version -m hello-server-d | tail -n +2) <(go version -m hello-server-d-golang | tail -n +2)   # one line: chainguard_go_package
docker tag golang@$GL builder:golang; docker tag cgr.dev/chainguard/go@$GD builder:cg-go
grype hello:d-golang --by-cve -o json=reports/after/d-golang-grype.json
grype builder:golang --by-cve -o json=reports/after/builder-golang-grype.json
grype builder:cg-go --by-cve -o json=reports/after/builder-cg-go-grype.json
bash tools/compare.sh builder:cg-go builder:golang
bash tools/triage.sh reports/after/builder-golang-grype.json reports/before/cisa-kev.json "" "" 8   # 1 KEV: openssh-client

docker rm -f hello-d
```

**Expect:** nothing breaks; `go` line 1.26.10; the forged IP believed by the original and ignored by D; the half-sent header held by the original and closed after 5 s by D; `hello:d` 34.9 MB; **0** in Grype, Trivy and govulncheck; D-golang also 0; builders: `chainguard/go` 0, `golang:latest` 325 (1 on KEV).

---

## 14 · Prove the result: the same-day rescan of all four images

**Goal:** rescan A to D on the same day with the same databases, generate `results.json` and the tables, prove D runs as non-root with no shell.
**Runs on:** the VM (`tools/results.sh` and `README.md` are written on the Mac and copied in) · **Log:** `logs/14-final.log`, `logs/14-final-mac.log` · **Screenshots:** `14-final-*.png` · **Produces:** `reports/final/*`, `results.json`, `tools/results.sh`, `README.md`, `CHALLENGE.md`

```bash
step 14-final

# Fresh databases (record the dates before and after)
grype db status -o json | jq -r .built; trivy version -f json | jq -r .VulnerabilityDB.UpdatedAt
grype db update; trivy image --download-db-only -q

# The KEV catalog, and the scanner record for people and for tools/results.sh
mkdir -p reports/final
curl -sSfL https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json -o reports/final/cisa-kev.json
{ echo "Same-day rescan of images A to D, $(date -u +%FT%TZ)"; echo; bash tools/versions.sh | grep -E "grype|trivy|syft|govulncheck"; grype db status; trivy version; govulncheck -version; jq -r '"CISA KEV catalog " + .catalogVersion' reports/final/cisa-kev.json; } > reports/final/scanner-versions.txt
jq -n --arg on "$(date -u +%FT%TZ)" --argjson gv "$(grype version -o json)" --argjson gd "$(grype db status -o json)" \
      --argjson tv "$(trivy version -f json)" --arg gov "$(govulncheck -version | grep -oP '(?<=Scanner: ).*')" \
      --argjson kev "$(jq '{catalogVersion, dateReleased, count}' reports/final/cisa-kev.json)" \
      '{scanned_on: $on, grype: {version: $gv.version, db_schema: $gd.schemaVersion, db_built: $gd.built},
        trivy: {version: $tv.Version, db_updated: $tv.VulnerabilityDB.UpdatedAt}, govulncheck: $gov, kev_catalog: $kev}' > reports/final/scanners.json

# The rescan: one Grype database for all four; Trivy scans once and converts
export GRYPE_DB_AUTO_UPDATE=false
for t in a b c d; do
  grype hello:$t --by-cve -q -o json=reports/final/$t-grype.json -o table=reports/final/$t-grype.txt -o sarif=reports/final/$t-grype.sarif
  trivy image -q --skip-db-update --format json --output reports/final/$t-trivy.json hello:$t
  trivy convert -q --scanners vuln --format table --output reports/final/$t-trivy.txt reports/final/$t-trivy.json   # --scanners: a summary even at zero
  trivy convert -q --format sarif --output reports/final/$t-trivy.sarif reports/final/$t-trivy.json
done
govulncheck -mode binary ./hello-server-b > reports/final/govulncheck-binary-abc.txt   # the binary A, B and C ship
govulncheck -mode binary ./hello-server-d > reports/final/govulncheck-binary-d.txt

# Image A's largest reports go into git gzipped (the originals are in .gitignore)
for f in a-grype.json a-trivy.json a-trivy.sarif; do gzip -9 -k -f reports/final/$f; done

# results.json and the tables (also starts each image: runs as, shell, Hello World!)
bash tools/results.sh

# D: non-root, no shell, proven from the filesystem
docker image inspect hello:d --format '{{.Config.User}}'                 # 65532
docker run --rm --entrypoint sh hello:d -c 'echo yes'                     # fails: exit code 127
cid=$(docker create hello:d); docker export $cid | tar -t | grep -v '/$' > /tmp/d-files.txt; docker rm $cid
wc -l < /tmp/d-files.txt; grep -c '^usr/share/zoneinfo' /tmp/d-files.txt  # 1254, 1201
grep -E '(^|/)(sh|bash|ash|busybox|apk|dpkg|apt)$' /tmp/d-files.txt || echo "none"

# The brief keeps its history as CHALLENGE.md; README.md becomes the front page
git mv README.md CHALLENGE.md
```

**Expect:** the same counts as the first scans if no database was published in between (here: none was): Grype 734 / 161 / 69 / 0, Trivy 10,856 / 253 / 157 / 0; KEV 3 / 1 / 1 / 0; all four answer "Hello World!"; D has no shell.

---

## 15 · SBOMs for all four images

**Goal:** an SBOM per image; compare scanning the SBOM with scanning the image; verify and compare Chainguard's own SBOM.
**Runs on:** the VM · **Log:** `logs/15-sbom.log` · **Screenshots:** `15-sbom-*.png` · **Produces:** `sbom/`, `reports/sbom/`

```bash
step 15-sbom

# One Syft run per image, two formats
mkdir -p sbom
for t in a b c d; do syft hello:$t -q -o spdx-json=sbom/$t.spdx.json -o cyclonedx-json=sbom/$t.cyclonedx.json; done
for t in a b c d; do   # packages by package-URL type
  jq -r '[.packages[].externalRefs[]? | select(.referenceType == "purl") | .referenceLocator | capture("^pkg:(?<t>[^/]+)/").t] | group_by(.) | map(.[0] + "=" + (length | tostring)) | join(" ")' sbom/$t.spdx.json
done

# Scan the SBOMs (same database as step 14) and compare with the image scans
export GRYPE_DB_AUTO_UPDATE=false
mkdir -p reports/sbom
for t in a b c d; do grype sbom:./sbom/$t.spdx.json --by-cve -q -o json=reports/sbom/$t-grype-from-spdx.json; done
grype sbom:./sbom/c.cyclonedx.json --by-cve -q -o json=reports/sbom/c-grype-from-cyclonedx.json
for t in a b c d; do bash tools/count.sh reports/final/$t-grype.json reports/sbom/$t-grype-from-spdx.json | grep -E "==|unique|layer"; done
grep -c symbol sbom/c.spdx.json                                   # 0: no symbol data, so no function-level matching
gzip -9 -k -f reports/sbom/a-grype-from-spdx.json                 # 54 MB; the original is in .gitignore

# Chainguard's signed SBOM for the static arm64 image that C and D build on
SD=$(grep -o "static:latest@sha256:[0-9a-f]*" dockerfiles/Dockerfile.c-chainguard | cut -d@ -f2)
A64=$(crane manifest cgr.dev/chainguard/static@$SD | jq -r '.manifests[] | select(.platform.architecture == "arm64") | .digest')
cosign verify-attestation --type https://spdx.dev/Document \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main \
  cgr.dev/chainguard/static@$A64 | head -1 | jq -r .payload | base64 -d | jq .predicate > sbom/chainguard-static-arm64.spdx.json

# The SBOMs shipped inside image D
mkdir -p sbom/inside-image-d
cid=$(docker create hello:d); docker cp $cid:/var/lib/db/sbom/. sbom/inside-image-d/; docker rm $cid
```

**Expect:** SBOM scans equal to the image scans for OS packages and for D, but higher for Go in A, B and C (C: 158 against 69); Chainguard's SBOM verified, with the same 3 packages as ours plus each package's build file and upstream source.

---

## 16 · A local registry, with C and D pushed

**Goal:** run a registry, push C and D, record their digests, inspect the default provenance.
**Runs on:** the VM · **Log:** `logs/16-registry.log` · **Screenshots:** `16-registry-*.png` · **Produces:** the `registry` container, `reports/after/registry*-grype.json`, `reports/provenance/`

```bash
step 16-registry

# Which registry image? Compare the two major tags before choosing (registry:2 is a 2023 build)
export RD=$(crane digest registry:2) R3=$(crane digest registry:3)
for d in $RD $R3; do crane config --platform linux/arm64 registry@$d | jq -r .created; done
GRYPE_DB_AUTO_UPDATE=false grype registry@$RD --by-cve -q -o json=reports/after/registry2-grype.json   # 72
GRYPE_DB_AUTO_UPDATE=false grype registry@$R3 --by-cve -q -o json=reports/after/registry3-grype.json   # 22

# Run registry:3, pinned; plain HTTP and no authentication: lab only
docker run -d -p 5000:5000 --name registry --restart unless-stopped registry@$R3
curl -s localhost:5000/v2/_catalog; curl -s -o /dev/null -w "%{http_code}\n" http://192.168.252.2:5000/v2/

# Push C and D; the registry digest must equal the local image ID
for t in c d; do docker tag hello:$t localhost:5000/hello:$t; docker push localhost:5000/hello:$t; done
for t in c d; do docker image inspect hello:$t --format '{{.Id}}'; crane digest localhost:5000/hello:$t; done

# Docker's default provenance: an attestation-manifest entry in D's index
crane manifest localhost:5000/hello:d | jq -c '.manifests[] | {digest, platform, type: .annotations["vnd.docker.reference.type"]}'
ATT=$(crane manifest localhost:5000/hello:d | jq -r '.manifests[] | select(.annotations["vnd.docker.reference.type"] == "attestation-manifest") | .digest')
L=$(crane manifest localhost:5000/hello@$ATT | jq -r '.layers[0].digest')
mkdir -p reports/provenance; crane blob localhost:5000/hello@$L > reports/provenance/d-buildkit-provenance.json
jq '.predicateType, .predicate.buildDefinition.resolvedDependencies' reports/provenance/d-buildkit-provenance.json
jq -c '[.. | objects | select(has("args")) | .args] | add' reports/provenance/d-buildkit-provenance.json   # vcs:source, vcs:revision
git show ca39930:go-patched/go.mod | grep gin-gonic                  # the recorded commit: still Gin v1.8.1

# Round trip: validate every blob, then run D from the registry by digest
D=$(crane digest localhost:5000/hello:d)
crane validate --remote localhost:5000/hello@$D
docker run -d --rm --name hello-d-reg -p 8084:8080 localhost:5000/hello@$D; sleep 2; curl -s localhost:8084; docker rm -f hello-d-reg
```

**Expect:** digests equal to the local image IDs (C `4f75bad2…`, D `c5ce9ddb…`); an `attestation-manifest` in D's index with SLSA v1 provenance listing both base images by digest; `crane validate` PASS; Hello World! from the registry copy.

---

## 17 · Sign image D and verify it

**Goal:** sign D by digest, verify it, show unsigned C and a wrong key fail, attach and verify a signed SBOM.
**Runs on:** the VM; you type the key's password at each prompt · **Log:** `logs/17-sign.log` · **Screenshots:** `17-*.png` · **Produces:** `cosign.pub`, `reports/signing/` (the private key stays in `~/cosign-lab`, outside the repo)

```bash
step 17-sign

# Key pair, outside the repo (prompts for the password twice)
mkdir -p ~/cosign-lab && chmod 700 ~/cosign-lab
(cd ~/cosign-lab && cosign generate-key-pair)
cp ~/cosign-lab/cosign.pub cosign.pub
openssl pkey -pubin -in cosign.pub -outform DER | sha256sum                # fingerprint

# Sign D by digest, without the public transparency log (prompts for the password)
export D=$(crane digest localhost:5000/hello:d)
cosign sign --key ~/cosign-lab/cosign.key --use-signing-config=false --tlog-upload=false localhost:5000/hello@$D

# Where it went: no referrers API on registry:3, so a sha256-<digest> tag points at the signature
curl -s -o /dev/null -w "%{http_code}\n" localhost:5000/v2/hello/referrers/$D   # 404
crane ls localhost:5000/hello
cosign tree localhost:5000/hello@$D

# Verify: D passes; C (never signed) and D with another key fail
C=$(crane digest localhost:5000/hello:c)
COSIGN_PASSWORD="" cosign generate-key-pair --output-key-prefix /tmp/other  # throwaway key, signs nothing
cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello@$D       # PASS
cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello@$C       # no signatures found
cosign verify --key /tmp/other.pub --insecure-ignore-tlog=true localhost:5000/hello@$D   # Found: 0
rm -f /tmp/other.key /tmp/other.pub

# A signed SBOM attestation on D (prompts for the password), then verify and decode it
cosign attest --key ~/cosign-lab/cosign.key --use-signing-config=false --tlog-upload=false \
  --type spdxjson --predicate sbom/d.spdx.json localhost:5000/hello@$D
cosign verify-attestation --key cosign.pub --insecure-ignore-tlog=true --type spdxjson localhost:5000/hello@$D \
  | head -1 | jq -r .payload | base64 -d | jq '{predicateType, subject, packages: (.predicate.packages | length)}'
```

**Expect:** PASS for D, "no signatures found" for C, "Found: 0" for the other key; the attestation verifies and holds `sbom/d.spdx.json`. cosign warns that the transparency log was skipped, then lists a log check anyway: trust the warning.

---

## 18 · The k3s VM

**Goal:** a k3s cluster on its own VM that pulls from the build VM's registry, managed by kubectl on the build VM.
**Runs on:** the Mac (VM, registry setting, install, kubeconfig), then the build VM · **Logs:** `logs/18-k3s-mac.log`, `logs/18-k3s.log` · **Screenshots:** `18-k3s-*.png`

```bash
# On the Mac. Pick the version: the stable channel, which matches kubectl on the build VM (v1.37)
curl -s https://update.k3s.io/v1-release/channels | jq -r '.data[] | select(.name == "stable" or .name == "latest") | .name + " " + .latest'
multipass launch 24.04 --name k3s --cpus 2 --memory 3G --disk 15G --timeout 900
multipass info k3s                                       # 192.168.252.3

# The registry is plain HTTP: say so before installing k3s
multipass exec k3s -- curl -s http://192.168.252.2:5000/v2/_catalog
multipass exec k3s -- sudo mkdir -p /etc/rancher/k3s
printf 'mirrors:\n  "192.168.252.2:5000":\n    endpoint:\n      - "http://192.168.252.2:5000"\n' \
  | multipass exec k3s -- sudo tee /etc/rancher/k3s/registries.yaml

# Download and read the install script, then run it pinned
multipass exec k3s -- bash -c 'curl -sfL https://get.k3s.io -o /tmp/k3s-install.sh && sha256sum /tmp/k3s-install.sh'
multipass exec k3s -- sed -n '462,476p;567,576p' /tmp/k3s-install.sh        # download_hash, verify_binary
multipass exec k3s -- sudo env INSTALL_K3S_VERSION=v1.37.2+k3s1 sh /tmp/k3s-install.sh
multipass exec k3s -- sudo k3s kubectl get nodes

# The admin kubeconfig to the build VM, pointed at the k3s VM (a credential: don't print it)
multipass exec k3s -- sudo cat /etc/rancher/k3s/k3s.yaml | sed "s/127.0.0.1/192.168.252.3/" \
  | multipass exec chainguard -- bash -c 'mkdir -p ~/.kube && umask 077 && cat > ~/.kube/config && chmod 600 ~/.kube/config'

# Prove the cluster can pull D over plain HTTP, by digest
multipass exec k3s -- sudo k3s crictl pull 192.168.252.2:5000/hello@sha256:c5ce9ddb3a8db38d7ef61bdd6c84905bd1d3e7ef61a3c51bbd0d6d7aa7270a08
```

```bash
# On the build VM
step 18-k3s
kubectl version
kubectl get nodes -o wide
kubectl get pods -A
kubectl get ns -L pod-security.kubernetes.io/enforce
```

**Expect:** node `k3s` Ready on v1.37.2+k3s1; client and server versions match; the pull succeeds with image ID `67d91c78701a…`.

---

## 19 · Deploy image D to the cluster

**Goal:** D on Kubernetes by its signed digest, under the restricted Pod Security level; prove what that guarantees and what it doesn't.
**Runs on:** the build VM (kubectl), plus two checks on the k3s node from the Mac · **Logs:** `logs/19-deploy.log`, `logs/19-deploy-mac.log` · **Screenshots:** `19-*.png` · **Produces:** `k8s/deployment.yaml`, `k8s/service.yaml`

```bash
step 19-deploy

# Validate, then enforce the restricted level on the namespace
kubectl apply --dry-run=server -f k8s/
kubectl label namespace default pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/warn=restricted

# Negative test: the same image without security settings is refused
kubectl run bad --image=192.168.252.2:5000/hello@sha256:c5ce9ddb3a8db38d7ef61bdd6c84905bd1d3e7ef61a3c51bbd0d6d7aa7270a08 --restart=Never

# Deploy, and check which digest the pods run
kubectl apply -f k8s/
kubectl rollout status deployment/hello
kubectl get deploy,svc,pods -l app=hello
kubectl get pods -l app=hello -o jsonpath='{range .items[*]}{.metadata.name}  {.status.containerStatuses[0].imageID}{"\n"}{end}'

# Reach it, try a shell, read the logs, delete a pod
(kubectl port-forward svc/hello 8085:8080 &); sleep 2; curl -s localhost:8085; pkill -f "port-forward svc/hello"
P=$(kubectl get pods -l app=hello -o name | head -1)
kubectl exec $P -- sh -c 'echo shell'                              # fails: no sh in the image
kubectl logs $P --tail=3
kubectl delete $P --wait=false; sleep 8; kubectl get pods -l app=hello

# The gap: unsigned C runs too (then remove it)
C=$(crane digest localhost:5000/hello:c)
sed -e "s/^  name: hello$/  name: hello-c/" -e "s/app: hello$/app: hello-c/" -e "s|hello@sha256:[0-9a-f]*|hello@$C|" k8s/deployment.yaml | kubectl apply -f -
kubectl rollout status deployment/hello-c; kubectl delete deployment hello-c
```

```bash
# On the Mac: what the k3s node really applied
multipass exec k3s -- ps -o uid,gid,args -C hello-server
for c in $(multipass exec k3s -- sudo k3s crictl ps --name hello -q); do
  multipass exec k3s -- sudo k3s crictl inspect $c | jq -c '{user: .info.runtimeSpec.process.user, readonly: .info.runtimeSpec.root.readonly, nnp: .info.runtimeSpec.process.noNewPrivileges, caps: .info.runtimeSpec.process.capabilities, seccomp: .info.runtimeSpec.linux.seccomp.defaultAction}'
done
```

**Expect:** the bare pod Forbidden with four reasons; 2/2 ready on digest `c5ce9ddb…`; Hello World!; no shell; a replacement pod within seconds; 65532:65532, read-only root, no capabilities on the node; and unsigned C running too.

---

## 20 · The pipeline: gate, runner, signing, signature policy

**Goal:** a private repo whose pull requests run a seven-check gate on the build VM, whose merges sign and deploy, and a cluster that only admits signed images.
**Runs on:** the build VM (Kyverno, runner, gate, deploy), the Mac (GitHub), GitHub · **Logs:** `logs/20-ci.log`, `logs/20-ci-mac.log` · **Screenshots:** `20-*.png` · **Produces:** the private repo `hello-ai` (snapshot in `ci/hello-ai/`), `ci/resolve.py`
**You type:** the runner's registration token (hidden prompt); the `COSIGN_PASSWORD` secret (GitHub's settings page); `gh auth refresh -h github.com -s workflow` (your own terminal)

```bash
step 20-ci

# 1. Kyverno v1.19.2 (v1.20.0 was under our own 7-day rule), then test the policy first, with D (signed) and C (unsigned)
mkdir -p ~/ci && curl -sSfL https://github.com/kyverno/kyverno/releases/download/v1.19.2/install.yaml -o ~/ci/kyverno-v1.19.2-install.yaml
grep -E "^\s+image:" ~/ci/kyverno-v1.19.2-install.yaml | sort -u
kubectl apply --server-side -f ~/ci/kyverno-v1.19.2-install.yaml
kubectl -n kyverno wait --for=condition=Available deployment --all --timeout=300s
kubectl apply -f ci/hello-ai/policy/require-signature.yaml          # credentials.allowInsecureRegistry: plain-HTTP registry
kubectl create namespace policytest
kubectl run t-d -n policytest --image=192.168.252.2:5000/hello@$(crane digest localhost:5000/hello:d) --restart=Never   # admitted
kubectl run t-c -n policytest --image=192.168.252.2:5000/hello@$(crane digest localhost:5000/hello:c) --restart=Never   # denied
kubectl delete namespace policytest

# 2. The runner: download, check the SHA-256 from the release notes, register (paste the token), run in its own window
V=2.338.2; F=actions-runner-linux-arm64-$V.tar.gz; mkdir -p ~/actions-runner
curl -sSfL -o ~/actions-runner/$F https://github.com/actions/runner/releases/download/v$V/$F
EXP=$(curl -s https://api.github.com/repos/actions/runner/releases/tags/v$V | jq -r .body | grep -oP "(?<=BEGIN SHA linux-arm64 -->)[0-9a-f]{64}")
(cd ~/actions-runner && echo "$EXP  $F" | sha256sum -c && tar -xzf $F)
read -r -s -p "Runner token: " RTOKEN; echo
(cd ~/actions-runner && ./config.sh --unattended --url https://github.com/saadallahchebaro/hello-ai --token "$RTOKEN" --name chainguard-build-vm --labels lab --work _work --replace); unset RTOKEN
tmux new-window -d -n runner -t lab "cd ~/actions-runner && ./run.sh 2>&1 | tee -a ~/ci/runner.log"

# 3. Pin every Python package, each at least 7 days old (inside the image the build uses)
PYDEV=cgr.dev/chainguard/python:latest-dev@sha256:e0df0ab3cb72380c82f8c5513538152e822a6d8994252663060adea9fdc450c2
docker run --rm -v ~/ci:/ci:ro $PYDEV /ci/resolve.py [extra packages] > requirements.txt

# 4. Run the gate by hand before the first push
GATE_COMMIT=localtest0000000 ./gate.sh

# 5. Push from the VM with a deploy key for hello-ai (needs gh's workflow scope, which the key inherits)
ssh-keygen -q -t ed25519 -N "" -C "chainguard build VM: hello-ai deploy key" -f ~/.ssh/hello_ai_deploy
cd ~/hello-ai && git config core.sshCommand "ssh -i ~/.ssh/hello_ai_deploy -o IdentitiesOnly=yes" && git push -u origin main

# 6. After the deploy run: the pods, the app, and an image pushed around the gate (must be refused)
kubectl get pods -l app=hello-ai -o custom-columns=NAME:.metadata.name,IMAGE:.status.containerStatuses[0].imageID
printf "FROM localhost:5000/hello-ai@$(crane digest localhost:5000/hello-ai:33ba9d7)\nLABEL note=\"pushed without the gate\"\n" | docker build -q -t localhost:5000/hello-ai:bypass -
docker push -q localhost:5000/hello-ai:bypass
kubectl create namespace bypass-test
kubectl run bypass -n bypass-test --image=192.168.252.2:5000/hello-ai@$(crane digest localhost:5000/hello-ai:bypass) --restart=Never
kubectl delete namespace bypass-test
```

```bash
# On the Mac (gh on the personal account)
gh repo create saadallahchebaro/hello-ai --private
gh api repos/actions/checkout/git/ref/tags/v7.0.1                    # pin the action by commit
gh repo deploy-key add hello_ai_deploy.pub --repo saadallahchebaro/hello-ai --allow-write --title "chainguard build VM (hello-ai)"
gh pr create --repo saadallahchebaro/hello-ai --head add-http-client --base main --title "Add an HTTP client dependency"
gh run watch <run id> --repo saadallahchebaro/hello-ai
gh run view --job=<job id> --repo saadallahchebaro/hello-ai --log | grep -E "(PASS|FAIL|GATE) "
gh pr merge 1 --repo saadallahchebaro/hello-ai --merge             # a person's decision
```

**Expect:** Kyverno denies C and admits D; the gate 7/7 by hand; the first deploy run signs and rolls out `hello-ai`; the bypass image denied; pull request #1 red (`FAIL pinned deps`), then green; the merge rolls out a new signed digest.

---

## 21 · An agent in the pipeline

**Goal:** an agent's unguarded change refused by the gate, fixed by the agent from the log and a review, merged by a person and deployed; the Git-hook fallback; the live run sheet (`demo/demo.md`).
**Runs on:** the Mac (the agent CLI, headless; `gh` on the personal account), the VM (tools, runner, hook) · **Logs:** `logs/21-agent.log`, `logs/21-agent-mac.log` · **Screenshots:** `21-*.png` · **Produces:** `ci/agent-runs/`, `ci/git-hook/pre-receive`, `demo/demo.md`

```bash
# On the VM: dfc, and both tools reachable by multipass exec
step 21-agent
go install github.com/chainguard-dev/dfc@v0.10.0
sudo ln -sf ~/go/bin/dfc /usr/local/bin/dfc; sudo ln -sf ~/go/bin/crane /usr/local/bin/crane
printf "FROM python:3.12-slim\n" | dfc --org chainguard -          # -> cgr.dev/chainguard/python:3.12 (not served on the free tier)
```

```bash
# On the Mac. Inside the desktop app's terminal, start the agent with a clean environment
AGENT='env -i HOME=$HOME PATH=$PATH USER=$USER TERM=$TERM claude -p'

# The unguarded change: a folder with only app/ and requirements.txt; files only
cd agent-bare && $AGENT "Write a Dockerfile for this FastAPI service, and add httpx as a dependency for outbound HTTP calls." \
  --allowedTools "Read,Write,Edit,Glob,Grep"
# copy its files unedited to a branch of hello-ai, push, open the pull request; the gate goes red

# The fix: the agent reads the log; files, read-only gh, dfc and crane on the VM; no git on the allowlist (since step 24 the console denies git outright: JOURNAL surprise 50)
cd hello-ai && cat ../agent-prompts/fix.txt | $AGENT --allowedTools "Read,Edit,Write,Glob,Grep,Bash(gh pr checks:*),Bash(gh run view:*),Bash(gh run list:*),Bash(multipass exec chainguard -- dfc:*),Bash(multipass exec chainguard -- crane digest:*)"
cat ../agent-prompts/review.txt | $AGENT --allowedTools "Read,Edit,Write,Glob,Grep,Bash(gh pr checks:*),Bash(gh run view:*),Bash(gh run list:*),Bash(multipass exec chainguard -- crane digest:*),Bash(multipass exec chainguard -- crane config:*)"
git diff                                                            # a person reviews; then commit, push, wait for green
gh pr merge 2 --repo saadallahchebaro/hello-ai --merge             # a person's decision
```

```bash
# On the VM: reproduce a failed build the gate hid, and run the image the gate built
cd ~/actions-runner/_work/hello-ai/hello-ai && docker build --progress=plain . 2>&1 | grep -E "ERROR|denied"
docker run -d --rm --name agent-check --read-only --user 65532:65532 --cap-drop ALL -p 8090:8080 hello-ai:<sha>; curl -s localhost:8090/

# The Git-hook fallback: the same gate on a bare repository
git init --bare ~/hello-ai.git && install -m 755 ci/git-hook/pre-receive ~/hello-ai.git/hooks/pre-receive
cd ~/hello-ai && git remote add local ~/hello-ai.git
git push local ae66f6f:refs/heads/unguarded                         # refused: pre-receive hook declined
git push local origin/main:refs/heads/main                          # accepted
```

**Expect:** the unguarded change red on base image, signature and scan; the agent's first fix red on build; the reviewed fix green, and the image answering on 8080; the merge deployed; the hook refusing the unguarded commit.

---

## 22b · Verify Chainguard's SLSA provenance

**Goal:** check the signed provenance of the two Chainguard images the Dockerfiles pin, and read what it records.
**Runs on:** the VM · **Log:** `logs/22b-provenance.log` · **Screenshots:** `22b-*.png` · **Produces:** `reports/provenance/chainguard-{static,go}-slsa.json`

```bash
step 22b-provenance
SD=$(grep -o "static:latest@sha256:[0-9a-f]*" dockerfiles/Dockerfile.c-chainguard | cut -d@ -f2)
GD=$(grep -o "go:latest@sha256:[0-9a-f]*" dockerfiles/Dockerfile.d-patched | cut -d@ -f2)
S64=$(crane manifest cgr.dev/chainguard/static@$SD | jq -r '.manifests[] | select(.platform.architecture == "arm64") | .digest')
G64=$(crane manifest cgr.dev/chainguard/go@$GD | jq -r '.manifests[] | select(.platform.architecture == "arm64") | .digest')
cosign tree cgr.dev/chainguard/static@$S64                   # one signature, three attestations

for i in "static $S64" "go $G64"; do set -- $i
  cosign verify-attestation --type https://slsa.dev/provenance/v1 \
    --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
    --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main \
    cgr.dev/chainguard/$1@$2 | head -1 | jq -r .payload | base64 -d | jq . > reports/provenance/chainguard-$1-slsa.json
done
jq '.predicate.buildDefinition.internalParameters' reports/provenance/chainguard-static-slsa.json   # the exact package versions
jq '.predicate.runDetails.builder' reports/provenance/chainguard-static-slsa.json                   # who built it
```

**Expect:** exit 0 for both, signed by the release workflow; the subject equal to the digest checked; `static` naming 3 packages and `go` 66; no SLSA level, no source repository, no resolved dependencies in either.

---

## 23 · The demo console

**Goal:** run the live demos from a browser page: the CI demo step by step, and read-only proofs for the deck.
**Runs on:** the Mac (the console server, `git`, `gh`, the coding agent), the VM through `multipass exec` · **Produces:** `demo/console/`

```bash
node demo/console/server.js              # then open http://127.0.0.1:8077/ci and http://127.0.0.1:8077/present
# inside the Claude desktop app's terminal panel, start it with a clean environment instead:
env -i HOME="$HOME" PATH="$PATH" USER="$USER" TERM="$TERM" node demo/console/server.js
```

**Expect:** the checks all green once `gh` is on the personal account; each step's commands and output in the terminal panel; Replay plays the recorded run without executing anything.

---

## 24 · An agent-skill gate with NVIDIA SkillSpector

**Goal:** scan every skill before the agent may load it; one blocked, one allowed.
**Runs on:** the build VM (SkillSpector, the gate), then the Mac (the console copies the allowed skill into the `hello-ai` clone) · **Log:** `logs/24-skill-gate.log` · **Screenshots:** `24-skill-gate-*.png` · **Produces:** `~/skillspector`, `reports/skills/`

```bash
step 24-skill-gate
# The newest SkillSpector release at least 7 days old (v2.13.4, tag commit 54824463), its dependencies held to the same cooldown
sudo apt-get install -y -q python3.12-venv
python3 -m venv ~/skillspector && ~/skillspector/bin/pip install -q uv==0.13.7
~/skillspector/bin/uv pip install --python ~/skillspector/bin/python --exclude-newer 2026-11-10T00:00:00Z \
  "skillspector @ https://github.com/NVIDIA/SkillSpector/archive/54824463814a0be01360792523ec7245a69190fc.tar.gz"
~/skillspector/bin/skillspector --version                              # SkillSpector v2.13.4
~/skillspector/bin/uv pip freeze --python ~/skillspector/bin/python > reports/skills/skillspector-freeze.txt

# The gate: static analysis only, exit 0 allowed, 1 blocked, 2 scan error
bash ci/skills/skill-gate.sh ci/skills/unvetted/dockerfile-fixer       # BLOCKED, risk 100/100
bash ci/skills/skill-gate.sh ci/skills/vetted/chainguard-dockerfile    # ALLOWED, risk 0/100
```

In the console the agent runs with `--setting-sources project,local` (no user skills or plugins) and `--disallowedTools 'Bash(git:*),Bash(/usr/bin/git:*)'` (no git, read-only included).

**Expect:** `dockerfile-fixer` blocked with 10 findings (prompt injection, `curl | bash`, base64-encoded code, `chmod 777`, `--no-verify`); `chainguard-dockerfile` allowed with none. In the console, step 4 runs both and installs only the allowed one, and step 5 gives it to the agent.

**VS Code over SSH (the Mac):**

```bash
ssh-keygen -q -t ed25519 -N "" -C "chainguard-lab" -f ~/.ssh/chainguard_lab
for vm in chainguard k3s; do multipass exec $vm -- bash -c 'umask 077; mkdir -p ~/.ssh; read -r k; grep -qxF "$k" ~/.ssh/authorized_keys 2>/dev/null || echo "$k" >> ~/.ssh/authorized_keys' < ~/.ssh/chainguard_lab.pub; done
# trust each host key only if it matches what the VM itself reports (multipass exec <vm> -- ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)
ssh-keyscan -t ed25519 192.168.252.2 192.168.252.3 >> ~/.ssh/known_hosts
# ~/.ssh/config: Host chainguard-lab (192.168.252.2) and Host k3s-lab (192.168.252.3), User ubuntu, IdentityFile ~/.ssh/chainguard_lab
code --install-extension ms-vscode-remote.remote-ssh
code --folder-uri "vscode-remote://ssh-remote+chainguard-lab/home/ubuntu/chainguard-technical-challenge"
```

---

## 25 · Presenter tools: the command deck, the showcase folder and the VS Code workspace

**Goal:** answers on the shared screen at one click, every file worth opening in one folder, and VS Code set up for both.
**Runs on:** the build VM (the showcase folder, the `show` tmux session), the Mac (the console, VS Code) · **Log:** `logs/25-presenter-tools.log` · **Screenshots:** `25-*.png` · **Produces:** `showcase/`

```bash
step 25-presenter-tools
bash tools/make-showcase.sh && ls showcase                       # nine folders, 01-dockerfiles to 09-lab-notes, and a README
echo "links: $(find showcase -type l | wc -l), broken: $(find showcase -xtype l | wc -l)"   # links: 57, broken: 0
```

**The command deck (the Mac, then the shared screen):**

```bash
env -i HOME="$HOME" PATH="$PATH" USER="$USER" TERM="$TERM" node demo/console/server.js   # then open http://127.0.0.1:8077/deck
# on the deck: "Create the show session", then on the shared screen:
ssh -t chainguard-lab tmux new -A -s show
```

**VS Code (the Mac):**

```bash
code --file-uri "vscode-remote://ssh-remote+chainguard-lab/home/ubuntu/chainguard-technical-challenge/chainguard-lab.code-workspace"
```

**Expect:** each deck button types its command into the `show` session and runs it (for example "Run image D and call it": `D answers: Hello World!`); VS Code opens with **Showcase: open these** first, and its terminal menu offers the lab folder, a shell in A or B, a sidecar for C or D, and `kubectl`.

---

## 26 · Live build, scan and sign commands, and the deck's appendix

**Goal:** answer "can you show me?" for building, scanning, signing and admission, live, without touching the recorded evidence.
**Runs on:** the build VM (Docker, the scanners, cosign, kubectl), from the demo console or the command deck · **Log:** `logs/26-live-commands.log` · **Screenshots:** `26-*.png`

```bash
step 26-live-commands
# Build: throwaway tags only; the recorded hello:a to hello:d are never rebuilt
docker build -t hello-live:d -f dockerfiles/Dockerfile.d-patched ./go-patched
docker build --no-cache -t hello-live:d -f dockerfiles/Dockerfile.d-patched ./go-patched   # then compare the binary's hash with hello:d's
# Scan: the recorded databases (no update), or today's in /tmp
GRYPE_DB_AUTO_UPDATE=false grype hello:d --by-cve
GRYPE_DB_CACHE_DIR=/tmp/grype-today grype hello:d --by-cve; rm -rf /tmp/grype-today   # needs about 4 GB free (surprise 52)
govulncheck -C go ./...                       # the original source; -C go-patched for D's
# Push, sign (you type the key's password), verify, and ask the cluster in dry runs
docker tag hello-live:d localhost:5000/hello-live:d && docker push -q localhost:5000/hello-live:d
cosign sign --key ~/cosign-lab/cosign.key --use-signing-config=false --tlog-upload=false localhost:5000/hello-live@$(crane digest localhost:5000/hello-live:d)
cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello-live@$(crane digest localhost:5000/hello-live:d)
kubectl run live-check -n bypass-test --restart=Never --image=192.168.252.2:5000/hello-live@$(crane digest localhost:5000/hello-live:d) --dry-run=server -o name
# The original app (C) against the patched one (D): warnings and forged IP, the half-sent header, every changed component
bash tools/show-fixes.sh all
# Clean up the live builds (the registry keeps the hello-live repository)
docker rmi hello-live:a hello-live:b hello-live:c hello-live:d localhost:5000/hello-live:d
```

**Expect:** the live builds answer "Hello World!"; D rebuilt with no cache has the same binary hash as `hello:d` (`00aee679…`), under a new image ID; Grype finds nothing in D, with the recorded database and with today's; `show-fixes.sh` shows Gin's two warnings and the forged IP in C only, C holding half a request open past 10 s and D closing it after 5 s, and the components table; the live D verifies only after it's signed, and the cluster's dry run admits it only then; unsigned C is refused.

**The deck (the Mac; kept outside the repo):** a new slide 18 (the app's first-run warnings, and D's fixes tested), and an appendix, slides 39 to 54: an index, ten in-depth tables (one of them image B's CVEs ranked, with whether each is exploitable as deployed) and five slides of the lab's own screenshots, built from REPORT.md, JOURNAL.md, `reports/`, `sbom/` and `logs/`.

---

## 27 · Grype against Trivy, ID by ID

**Goal:** a comparison that shows where the two scanners differ, why, and whether it matters.
**Runs on:** the build VM · **Log:** `logs/27-comparison.log` · **Produces:** `reports/final/comparison.md`

```bash
step 27-comparison
python3 tools/comparison.py && sed -n "/^## 3/,/^## 4/p" reports/final/comparison.md   # also run by tools/results.sh after results.json
```

**Expect:** A 709 both, 25 only Grype, 10,147 only Trivy; B 160, 1 and 93; C 68, 1 and 89; D none. Every number in sections 1 and 2 matches `results.json`.

---

## 28 · Chainguard's base against Google's distroless

**Goal:** image C on Google's distroless static base, measured beside image C on Chainguard's.
**Runs on:** the build VM · **Log:** `logs/28-distroless.log` · **Produces:** `hello:c-distroless`, `reports/distroless/`

```bash
step 28-distroless
crane digest gcr.io/distroless/static-debian13:nonroot          # sha256:aafe9936…, pinned in Dockerfile.c-distroless
cosign verify gcr.io/distroless/static-debian13@sha256:aafe993665bf6200db38a02c11a9351e782a84b6a45e7f33b6695638c88e3931 \
  --certificate-oidc-issuer https://accounts.google.com --certificate-identity keyless@distroless.iam.gserviceaccount.com
diff <(grep -v "^#" dockerfiles/Dockerfile.c-chainguard) <(grep -v "^#" dockerfiles/Dockerfile.c-distroless)   # only the runtime FROM
docker build -q -t hello:c-distroless -f dockerfiles/Dockerfile.c-distroless ./go
bash tools/compare-bases.sh > reports/distroless/comparison.md   # the recorded databases, no update
```

**Expect:** both bases verified; 0 OS CVEs in both; 69 (Grype) and 157 (Trivy) in both, from the same binary `ec6fa6de…`; 3 against 6 packages, 19 MB against 21.6 MB; Chainguard's base carries an SBOM, SLSA provenance and its build configuration, the distroless base an SBOM.

## 29 · Readable signature and provenance screenshots

**Goal:** step 17's three verify checks and step 22b's provenance check on the static base again, wrapped to fit a slide card.
**Runs on:** the build VM; the screenshot on the Mac · **Log:** `logs/29-screenshots.log` · **Produces:** `demo/screenshots/29-verify-pass-fail-wrapped.png`, `demo/screenshots/29-chainguard-slsa-verified-wrapped.png`

```bash
step 29-screenshots
clear   # not recorded: a clean window for the screenshot
D=$(crane digest localhost:5000/hello:d); C=$(crane digest localhost:5000/hello:c)
rm -f /tmp/other.key /tmp/other.pub; COSIGN_PASSWORD="" cosign generate-key-pair --output-key-prefix /tmp/other >/dev/null 2>&1   # a throwaway pair
v() {   # verify image digest $2 with key $1: PASS and the signed digest, or FAIL and the first error lines, folded at 74 columns
  cosign verify --key $1 --insecure-ignore-tlog=true localhost:5000/hello@$2 > /tmp/v.json 2> /tmp/v.err; rc=$?
  if [ $rc = 0 ]; then m="PASS (exit 0). Signed digest: $(jq -r '.[0].critical.image["docker-manifest-digest"]' /tmp/v.json)"
  else m="FAIL (exit $rc): $(grep -i -E 'error|no ' /tmp/v.err | grep -v -i warning | head -2 | tr '\n' ' ' | cut -c1-140)"; fi
  echo "$m" | fold -s -w 74 | sed 's/^/   /'
}
echo "== 1. D with our key (cosign.pub):"; v cosign.pub $D
echo "== 2. C with our key (C was never signed):"; v cosign.pub $C
echo "== 3. D with a different key (a throwaway pair):"; v /tmp/other.pub $D
rm -f /tmp/other.key /tmp/other.pub
```

**Screenshot (on the Mac):** `bash tools/shot.sh 29-verify-pass-fail-wrapped`, with the Terminal window on the laptop's Retina display (an external 1x display gives half the resolution).

**Expect:** 1. PASS (exit 0) and `sha256:c5ce9ddb…`; 2. FAIL (exit 10), no signatures found; 3. FAIL (exit 1), accepted signatures do not match threshold. Every line fits in a 96-column window.

Then Chainguard's provenance on the static base, the arm64 digest from step 22b, with long lines wrapped at 74 columns (at a space or after a `/`):

```bash
clear   # not recorded
S64=sha256:8f9c7533c7709270342660bca209e5fc593483c27f95283e1082424c1e0da967
wrap() { awk -v W=74 '{ s=$0; ind=""; while (length(ind s) > W) { n=W-length(ind); cut=0
  for (i=n; i>20; i--) { c=substr(s,i,1); if (c==" ") { cut=i; k=i-1; break } if (c=="/") { cut=i; k=i; break } }
  if (cut==0) { cut=n; k=n } print ind substr(s,1,k); s=substr(s,cut+1); ind="    " } print ind s }'; }
{ echo "== cosign verify-attestation --type https://slsa.dev/provenance/v1 on cgr.dev/chainguard/static@${S64:0:19}…"
  cosign verify-attestation --type https://slsa.dev/provenance/v1 \
    --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
    --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main \
    cgr.dev/chainguard/static@$S64 2>/tmp/slsa.err >/tmp/slsa.json
  echo "exit $?, attestations returned: $(wc -l < /tmp/slsa.json)"
  grep -E "^  - |^Certificate subject|^Error" /tmp/slsa.err
  head -1 /tmp/slsa.json | jq -r .payload | base64 -d | jq -r --arg d "$S64" '"predicateType: " + .predicateType,
    "subject:       sha256:" + .subject[0].digest.sha256[0:12] + "… (the image verified: " + (("sha256:" + .subject[0].digest.sha256) == $d | tostring) + ")",
    "buildType:     " + (.predicate.buildDefinition.buildType // "-"), "builder:       " + (.predicate.runDetails.builder.id // "-"),
    "resolved deps: " + (.predicate.buildDefinition.resolvedDependencies // [] | length | tostring)'; } | wrap
```

**Screenshot (on the Mac):** `bash tools/shot.sh 29-chainguard-slsa-verified-wrapped`.

**Expect:** exit 0, 1 attestation, cosign's three claims; certificate subject Chainguard's release workflow; `https://slsa.dev/provenance/v1`; subject `sha256:8f9c7533c770…` (the image verified: true); build type `https://apko.dev/slsa-build-type@v1`; builder `terraform-provider-apko`; resolved deps 0. No line is longer than 74 columns.

## 30 · The builder comparison, as an appendix slide

**Goal:** `golang:latest`'s builder CVEs from step 13, counted by severity and by fix state, for the deck's slide 44.
**Runs on:** the build VM · **Log:** `logs/30-builder-slide.log` · **Screenshot:** `30-builder-cves-by-fix-state.png`

```bash
step 30-builder-slide
f=reports/after/builder-golang-grype.json
jq -r '[.matches[] | {id: .vulnerability.id, sev: .vulnerability.severity}] | unique_by(.id) | group_by(.sev) | map("   \(.[0].sev): \(length)") | .[]' $f
jq -r '[.matches[] | {id: .vulnerability.id, s: .vulnerability.fix.state}] | group_by(.id)
       | map(if any(.[]; .s == "fixed") then "fixed" elif any(.[]; .s == "wont-fix") then "wont-fix" elif any(.[]; .s == "not-fixed") then "not-fixed" else "other" end)
       | group_by(.) | map("   \(.[0]): \(length)") | .[]' $f
jq '[.matches[].vulnerability.id] | unique | length' $f reports/after/builder-cg-go-grype.json
```

**Expect:** Critical 10, High 68, Medium 73, Low 21, Negligible 140, Unknown 13; fixed 3, not-fixed 172, wont-fix 150; 325 for `golang:latest`, 0 for `chainguard/go`.

## 31 · Getting into D without a shell, and the side door

**Goal:** a debug container into D in Docker and on k3s, the side door it opens for an unsigned image, and which `-dev` tags exist.
**Runs on:** the build VM · **Log:** `logs/31-debug-d.log` · **Screenshots:** `31-debug-*.png` · **Produces:** `tools/debug-d.sh`

```bash
step 31-debug-d
tmux resize-window -A -t lab      # once: fit the tmux window to the Terminal, so long lines wrap in screenshots
BB=cgr.dev/chainguard/busybox@sha256:63f6bae487adff606359bd82418ffe0564564a6b272cf52107306749a714afb2
cosign verify $BB --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main >/dev/null
crane config --platform linux/arm64 $BB | jq -r .config.User                                    # 65532
docker run --rm $BB busybox --list | grep -x -E "sh|ps|ls|cat|netstat|wget|curl|nc"             # no wget, curl or nc
bash tools/debug-d.sh docker      # a throwaway container, removed at the end
bash tools/debug-d.sh k3s         # adds a debug container to one D pod, then deletes that pod
bash tools/debug-d.sh gap         # unsigned C: refused as a pod, admitted as a debug container; then deletes the pod
for i in static:latest static:latest-dev go:latest go:latest-dev busybox:latest; do echo "$i $(crane digest cgr.dev/chainguard/$i 2>&1 | tail -1)"; done
```

By hand, on the shared screen: `kubectl debug -it <hello-pod> --image=$BB --target=hello --profile=restricted` opens a shell in the debug container; delete the pod afterwards.

**Expect:** `exec: "sh": executable file not found` in Docker and on k3s; the debug container runs as 65532, sees `hello-server` as PID 1, the 20,222,796-byte binary and `:::8080`; on k3s it's admitted with `allowPrivilegeEscalation=false drop=ALL runAsNonRoot=true`; unsigned C is refused as a pod and admitted as a debug container; afterwards two `hello` pods, debug containers left: 0. `static:latest-dev` doesn't exist; `go:latest-dev` does.

## 32 · The Kubernetes manifests, checked against the cluster

**Goal:** every manifest in the repo by kind, and proof that the cluster runs exactly the two in `k8s/`, for the deck's slide 52.
**Runs on:** the build VM · **Log:** `logs/32-manifests.log` · **Screenshots:** `32-manifests-*.png` · **Produces:** `tools/check-manifests.sh`

```bash
step 32-manifests
wc -l k8s/*.yaml
grep -H "^kind:" k8s/*.yaml ci/hello-ai/k8s/*.yaml ci/hello-ai/policy/*.yaml
bash tools/check-manifests.sh show    # the two files with line numbers, then the checks; changes nothing
```

**Expect:** 45 and 13 lines; Deployment, Service, Deployment, Service and ImageValidatingPolicy; both objects `unchanged (server dry run)`; `kubectl diff` exit 0, 0 lines of difference; the same digest in the file, the cluster and the registry; `cosign verify exit 0`; the namespace labels `enforce=restricted` and `warn=restricted`; two endpoints, `ready=true`.

## 33 · Inspect and describe: D's image, container and pod

**Goal:** the full inspect of image D, a running D container's security settings, `kubectl describe` of a D pod and the live Deployment, for the console; where D's Author and labels come from.
**Runs on:** the build VM, plus one command on the Mac · **Logs:** `logs/33-inspect.log`, `logs/33-inspect-mac.log` · **Screenshots:** `33-*.png`

```bash
step 33-inspect
docker run -d --rm --name q-insp-d hello:d >/dev/null && sleep 1
docker inspect q-insp-d | jq '.[0] | {Image: .Image[0:19], State: .State.Status, User: .Config.User, Privileged: .HostConfig.Privileged, CapAdd: .HostConfig.CapAdd, CapDrop: .HostConfig.CapDrop, ReadonlyRootfs: .HostConfig.ReadonlyRootfs, SecurityOpt: .HostConfig.SecurityOpt}'
PID=$(docker inspect -f '{{.State.Pid}}' q-insp-d); ps -o user=,pid=,comm= -p $PID
grep -E '^(Uid|Gid|CapEff|CapBnd|NoNewPrivs|Seccomp):' /proc/$PID/status
docker stop q-insp-d >/dev/null
docker image inspect hello:d
S=$(grep -o 'cgr.dev/chainguard/static[^ ]*@sha256:[0-9a-f]*' dockerfiles/Dockerfile.d-patched)
crane config --platform linux/arm64 $S | jq -c '{author, title: .config.Labels["org.opencontainers.image.title"], labels: (.config.Labels | length)}'
docker image inspect hello:d | jq -c '.[0] | {author: .Author, title: .Config.Labels["org.opencontainers.image.title"], labels: (.Config.Labels | length)}'
grep -c -i -E '^(LABEL|MAINTAINER)' dockerfiles/Dockerfile.d-patched
kubectl describe pod $(kubectl get pods -l app=hello -o jsonpath='{.items[0].metadata.name}')
kubectl get deploy hello -o yaml | sed -E '/last-applied-configuration/{n;s/^( +).*/\1(the file as last applied, one line of JSON: left out here)/}'
```

On the Mac, D's processes on the k3s node:

```bash
multipass exec k3s -- bash -c 'for p in $(pgrep -x hello-server); do grep -E "^(Uid|Gid|CapEff|CapBnd|NoNewPrivs|Seccomp):" /proc/$p/status; done'
```

**Expect:** the container: user 65532, not privileged, no CapAdd or CapDrop, `ReadonlyRootfs: false`; its process: CapEff 0, CapBnd `00000000a80425fb`, NoNewPrivs 0, Seccomp 2. On k3s: CapEff 0, CapBnd 0, NoNewPrivs 1, Seccomp 2. The image: ID `sha256:c5ce9ddb…`, user 65532; the base and D both `{"author":"github.com/chainguard-dev/apko","title":"static","labels":8}`; 0 `LABEL` lines. The pod: the Image ID is the signed digest, `Mounts: <none>`, QoS `Burstable`. The Deployment: revision 1, generation 1.

## 34 · Six more live answers

**Goal:** nginx against Chainguard's nginx, Wolfi's record of a fix, D's dependencies today, D's logs in the cluster, a pod replaced, and resource use; each then a quick answer.
**Runs on:** the build VM · **Log:** `logs/34-live-asks.log` · **Screenshots:** `34-*.png`

```bash
step 34-live-asks
for i in nginx:latest cgr.dev/chainguard/nginx:latest; do
  GRYPE_DB_AUTO_UPDATE=false grype registry:$i --by-cve -q -o json > /tmp/q-cmp.json
  echo "$i ($(jq -r '.distro.name + " " + .distro.version' /tmp/q-cmp.json)): $(jq '[.matches[].vulnerability.id] | unique | length' /tmp/q-cmp.json) unique CVE IDs," \
       "$(jq '[.matches[] | select(.vulnerability.severity == "Critical" or .vulnerability.severity == "High") | .vulnerability.id] | unique | length' /tmp/q-cmp.json) critical or high," \
       "$(crane manifest --platform linux/arm64 $i | jq '[.layers[].size] | add / 1048576 | floor') MB compressed"
done; rm -f /tmp/q-cmp.json
curl -s https://packages.wolfi.dev/os/security.json -o /tmp/q-secdb.json
for id in CVE-2023-44487 CVE-2023-39325; do
  jq -r --arg id $id '.packages[] | .pkg.name as $n | .pkg.secfixes | to_entries[] | select(.value | index($id)) | "\($n) \(.key)"' /tmp/q-secdb.json | sort -V > /tmp/q-ids.txt
  echo "$id: $(awk '$2 != "0"' /tmp/q-ids.txt | wc -l) with a fixing version, $(awk '$2 == "0"' /tmp/q-ids.txt | wc -l) with 0"; grep -E "^(go-1\.[0-9]+|cosign|grype|helm|k3s|nghttp2) " /tmp/q-ids.txt
done; rm -f /tmp/q-secdb.json /tmp/q-ids.txt
( cd go-patched && M=$(go list -deps -f '{{with .Module}}{{.Path}}{{end}}' . | sort -u | grep -v '^hello-server$')
  go list -m -u -f '{{if .Update}}{{.Path}} {{.Version}} -> {{.Update.Version}}{{end}}' $M | grep . || echo none
  go list -m -u -f '{{.Path}} {{.Version}} -> {{.Update.Version}}' github.com/gin-gonic/gin@v1.8.1 )    # the control
docker create --name q-gv hello:d >/dev/null && docker cp q-gv:/usr/local/bin/hello-server /tmp/q-gv && docker rm q-gv >/dev/null
go version /tmp/q-gv; curl -s 'https://go.dev/dl/?mode=json' | jq -r '.[0].version'; rm -f /tmp/q-gv
kubectl logs -l app=hello --prefix --timestamps --tail=6
for p in $(kubectl get pods -l app=hello -o name); do echo "$p: $(kubectl logs $p | grep -c GIN-debug) debug-mode lines"; done
kubectl delete pod $(kubectl get pods -l app=hello -o jsonpath='{.items[0].metadata.name}') --wait=false; sleep 2; kubectl get pods -l app=hello
kubectl top node; kubectl top pods; docker stats --no-stream
```

**Expect:** nginx on Debian 13.7, 220 unique CVE IDs, 73 critical or high, 59 MB; Chainguard's nginx on Wolfi, 0 and 0, 6 MB (Grype database of 16 November). Wolfi's feed: 1,472 packages; CVE-2023-44487 with a fixing version for 82 (`cosign 2.2.0-r6`), CVE-2023-39325 for 110 (`go-1.21 1.21.3-r0`). D: no newer module versions, Gin v1.8.1 -> v1.12.0, Go 1.27.4 on both sides. Logs: probe requests every 10 s, no debug-mode lines. A deleted pod replaced within seconds, from the same digest. D's pods at a few MiB against a 64 MiB limit.

## 35 · The deck catches up with steps 31 to 34

**Goal:** the deck's slides and notes brought up to date with steps 31 to 34, and its "only signed images" claims qualified by F32.
**Runs on:** the Mac only; no lab commands. The deck is built outside the repo.

**Expect:** 81 slides, 59 shown; a new appendix slide 54, "What I can show live, and what it showed"; the screenshot slides at 55 to 59.

## 36 · Where D's modules came from, and how old they were

**Goal:** confirm D's modules came from Go's default proxy, and date each module version against a 7-day cooldown.
**Runs on:** the build VM · **Log:** `logs/36-libraries.log` · **Screenshot:** `36-module-dates-cooldown.png`

```bash
step 36-libraries
grep -c GOPROXY dockerfiles/Dockerfile.d-patched                      # 0
G=$(grep -o 'cgr.dev/chainguard/go[^ ]*@sha256:[0-9a-f]*' dockerfiles/Dockerfile.d-patched)
crane config --platform linux/arm64 $G | jq -r '.config.Env[]'        # no GOPROXY
go env GOPROXY                                                        # https://proxy.golang.org,direct
( cd go-patched && M=$(go list -deps -f '{{with .Module}}{{.Path}}{{end}}' . | sort -u | grep -v '^hello-server$')
  go list -m -f '{{.Time.Format "2006-01-02"}} {{.Path}} {{.Version}}' $M | sort )
```

**Expect:** no `GOPROXY` anywhere, so `proxy.golang.org`; 19 modules, the newest `golang.org/x/crypto v0.59.0` dated 2026-11-11, 5 days before D's build on 16 November.

## 37 · Image D split in two: D, the dependency update, and E, the app fixed

**Goal:** today's D retagged as E; a new D with the updated modules and the original app; D scanned like the others; D against E, live.
**Runs on:** the build VM · **Log:** `logs/37-image-e.log` · **Screenshots:** `37-*.png`

```bash
step 37-image-e
docker tag hello:d hello:e && docker tag hello:d-golang hello:e-golang && crane tag localhost:5000/hello:d e
git mv dockerfiles/Dockerfile.d-patched dockerfiles/Dockerfile.e-patched
git mv dockerfiles/Dockerfile.d-golang dockerfiles/Dockerfile.e-golang
mkdir go-updated && cp go-patched/go.mod go-patched/go.sum go-updated/ && cp go/main.go go/README.md go-updated/
# dockerfiles/Dockerfile.d-updated: Dockerfile.e-patched without ENV GIN_MODE=release
docker build -t hello:d -f dockerfiles/Dockerfile.d-updated ./go-updated
docker tag hello:d localhost:5000/hello:d && docker push localhost:5000/hello:d
for f in $(git ls-files sbom reports | grep -E "/(d[-.][^/]*|govulncheck-(binary|source)-d\.txt)$"); do
  git mv $f $(dirname $f)/$(basename $f | sed -E 's/^d([-.])/e\1/; s/-d\.txt$/-e.txt/'); done
GRYPE_DB_AUTO_UPDATE=false grype hello:d --by-cve -q -o json=reports/final/d-grype.json -o table=reports/final/d-grype.txt -o sarif=reports/final/d-grype.sarif
trivy image -q --skip-db-update --format json --output reports/final/d-trivy.json hello:d
trivy convert -q --scanners vuln --format table --output reports/final/d-trivy.txt reports/final/d-trivy.json
trivy convert -q --format sarif --output reports/final/d-trivy.sarif reports/final/d-trivy.json
docker create --name q-bin hello:d && docker cp q-bin:/usr/local/bin/hello-server ./hello-server-d && docker rm q-bin
govulncheck -mode binary ./hello-server-d > reports/final/govulncheck-binary-d.txt
(cd go-updated && govulncheck ./... > ../reports/after/govulncheck-source-d.txt)
syft hello:d -q -o spdx-json=sbom/d.spdx.json -o cyclonedx-json=sbom/d.cyclonedx.json
GRYPE_DB_AUTO_UPDATE=false grype sbom:./sbom/d.spdx.json --by-cve -q -o json=reports/sbom/d-grype-from-spdx.json
bash tools/show-fixes.sh all                      # D against E: logs, half a request, what changed
bash tools/results.sh                             # results.json and the tables, A to E
bash tools/make-showcase.sh
```

**Expect:** E still `sha256:c5ce9ddb…`, verified, `kubectl diff` exit 0; D a new digest, unsigned and refused by the cluster; D 0 in Grype and Trivy, govulncheck clean, 25 SBOM packages like E; D's log with Gin's warnings and the forged IP, E's without; D holding half a request open past 10 s, E closing it after 5 s.

If the console's scanner caches were updated (surprise 62), restore Grype's recorded database: download `vulnerability-db_v6.1.10_2026-11-15T16:11:12Z_1794810654.tar.zst` from `grype.anchore.io/databases/v6/`, check its SHA-256 (`dd51add6…`), then `grype db import` it.

## 38 · Ready for any day: Grype's age check, and disk space for the live database

**Goal:** live scans keep working with the recorded database after its 5 days run out; 4 GB free for the answer that downloads today's database.
**Runs on:** the build VM · **Log:** `logs/38-live-ready.log`

```bash
step 38-live-ready
# the expiry, simulated with a 1-hour limit: refused without the override, scanned with it
GRYPE_DB_AUTO_UPDATE=false GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1h grype hello:e --by-cve -q -o json | jq ".matches | length"
GRYPE_DB_AUTO_UPDATE=false GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1h GRYPE_DB_VALIDATE_AGE=false grype hello:e --by-cve -q -o json | jq ".matches | length"
# disk: unused build cache only
df --output=avail -k / | tail -1; docker builder prune -f | tail -1; df --output=avail -k / | tail -1
```

Then, on the Mac: add `GRYPE_DB_VALIDATE_AGE=false` to every `GRYPE_DB_AUTO_UPDATE=false grype` in `demo/console/actions/shortcuts.js` and `present.js`, restart the console, and run the scan answers with `GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1h` still exported.

**Expect:** exit 1 ("max allowed age is 1 hour"), then exit 0 and 0 matches; about 318 MB freed, more than 4,000,000 KB free; the scan answers give 734, 161, 69, 0 and 0, as on the deck.

The same database for every Grype run by the VM user, the pipeline's gate included:

```bash
mkdir -p ~/.config/grype && printf "%s\n" "db:" "  auto-update: false" "  validate-age: false" > ~/.config/grype/config.yaml
for d in ~/chainguard-technical-challenge ~/hello-ai /tmp; do (cd $d && grype config --load | grep -E "^ *(auto-update|validate-age):"); done
GRYPE_DB_AUTO_UPDATE=true grype config --load | grep -m1 auto-update       # an environment variable still wins
grype db status | grep Built; (cd ~/hello-ai && GATE_COMMIT=warmup000000 ./gate.sh); grype db status | grep Built
```

**Expect:** `auto-update: false` and `validate-age: false` in all three places, `true` with the variable; GATE PASS, and the same `Built: 2026-11-16T06:30:54Z` before and after.

## 39 · The Dockerfiles in full

**Goal:** show any image's Dockerfile with what changed from the image before.
**Runs on:** the build VM (or the Mac) · read-only

```bash
for k in a b c d e; do bash tools/show-dockerfile.sh $k; done
```

**Expect:** each file with its line numbers; `>` on 0, 5, 1, 2 and 1 lines for A to E. The presentation page's section "The Dockerfiles, A to E" runs the same command per image.

## 41 · Image D runs and answers after the update

**Goal:** show that the updated D starts and answers, with the Go and Gin versions in its binary.
**Runs on:** the build VM · leaves only `/tmp/d-check` (the container runs with `--rm` and is stopped)

```bash
docker image ls hello:d
docker create --name d-check hello:d >/dev/null && docker cp -q d-check:/usr/local/bin/hello-server /tmp/d-check && docker rm d-check >/dev/null; go version /tmp/d-check; go version -m /tmp/d-check | grep -E "gin-gonic/gin\s"
docker run -d --rm --name d-check -p 18081:8080 hello:d >/dev/null && sleep 1 && curl -si http://localhost:18081/; echo; docker logs d-check 2>&1 | tail -1; docker stop d-check >/dev/null
```

**Expect:** `76eb535bcdcd`; `go1.27.4` and Gin `v1.12.0`; `HTTP/1.1 200 OK` and `Hello World!`; Gin's log line with 200.

## 42 · govulncheck on each app binary

**Goal:** show what Go's own scanner finds in the binary each image ships, and that A, B and C ship the same file.
**Runs on:** the build VM, from the repo root (the `hello-server-*` binaries copied out of the images) · read-only

```bash
sha256sum hello-server-a hello-server-b hello-server-c
govulncheck -version | grep -E "Scanner|DB updated"
for b in b newgo d e; do echo "== hello-server-$b, $(go version ./hello-server-$b | cut -d" " -f2):"; govulncheck -mode binary ./hello-server-$b | grep -E "^(Your code is affected|No vulnerabilities)"; done
```

**Expect:** one hash for A, B and C; with the database of 2026-11-11, 62 for B, 11 for the newer-Go rebuild, none for D and E. A newer database can add vulnerabilities, above all to Go 1.18.

## 43 · How old Go and every module were

**Goal:** list Go and every module in the A-to-C binary against D's: version, publication date, and the CVEs in each.
**Runs on:** the build VM, from the repo root · read-only; needs network access to `proxy.golang.org` and `go.dev`

```bash
python3 tools/module-ages.py          # add --json for the same figures as JSON
```

**Expect:** go1.18.10 (2023-01-10) against go1.27.4 (2026-11-10); 15 modules dated 2019 to 2022 against 2026 versions; CVEs in the standard library, `x/net` (one on KEV), `x/text` and Gin for Grype, and also `x/crypto`, `x/sys` and `protobuf` for Trivy.
