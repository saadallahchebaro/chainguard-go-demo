# Demo console

A small local web app that drives the live demos from the browser, so every step is one button and its output streams into a terminal panel on the same page. Three pages:

- **CI demo** (`/ci`): an agent in the pipeline, step by step. A coding agent writes a change with no rules in view, the gate on the self-hosted runner refuses it, the agent reads the failure and fixes it, a person reviews and merges, and the pipeline signs and deploys to k3s, where an unsigned image is refused. The diagram has the top panel and the terminal the rest of the screen. It shows where each part of the pipeline runs: the coding agent and its allowlist, the pull request and check, the runner, gate.sh's seven checks and deploy.sh's push, sign, verify and apply, the registry, admission control and the pods, with Chainguard's images and PyPI as the upstream inputs. The checks and deploy steps turn green or red from the real output lines as they arrive. Dashed boxes tagged "production · not in lab" (issue tracker, AI reviewer, enforced required check, SBOM and provenance attestations, GitOps controller) are what a production pipeline adds at the same place; the lab has none of them, and no step lights them up. Step 4 is the agent-skill gate: NVIDIA SkillSpector scans two candidate skills on the build VM (`ci/skills/skill-gate.sh`), blocks the compromised one and installs the vetted one into the clone's `.claude/skills/`, which Git ignores; step 5's agent then uses it. The diagram's **Chainguard** switch, at the end of the upstream strip, puts Chainguard's products on the nodes they meet, each with its status; the presentation page's "Where Chainguard helps" section has the same products as a table (`actions/chainguard.js`, checked 17 November 2026). Step 12, **Where Chainguard fits**, runs no commands: it turns the diagram into a map of this agentic build, with every part tagged by the Chainguard product that replaces it, adds to it or works with it (the base images, the packages, the agent's skills, its sandbox and image lookups, the pull request, the workflow actions, the gate, the running app), and the three parts that stay yours (signing your own image, your registry and admission control); the terminal gives way to a table of the same 18 rows with each product's status. **Back to the pipeline**, or any other step, brings the terminal back. Under the steps, three sections fold away: "Before the demo, and fallbacks", "Last result" (its title and outcome stay on the folded line), and "This step, in the lab and beyond", which says what each step does in the lab, in an enterprise pipeline, with Chainguard's products, and for agents and AI.
- **Full presentation** (`/present`): one section per part of the deck, each with proofs that run on the lab VMs in seconds, read-only except the two `kubectl debug` ones, which replace the pod they use (sizes, users, image A in both scanners, shells, getting into the shell-less E with Docker and on k3s, the B→C diff, Chainguard's signature and provenance, D and E scanning the same but behaving differently, the rescan of D and E, the SBOM, cosign verify, the pods, the admission policy). Its first section, **Show me: quick answers**, has 132 one-click commands for likely questions, one tab per group (15 groups):
  - Dockerfiles and source: the lab repo on the build VM and the app as delivered (`main.go`, `go.mod`); Dockerfiles A to E, C to D and D to E side by side; whether D's and E's modules and Go are the newest today (`go list -m -u`, go.dev).
  - Images, digests and layers: also `docker image inspect` of E in full, the app binary's hash in each image, the modules compiled in (`go version -m`), `docker history`, and Chainguard's free tags.
  - **Build it live**: A to E rebuilt from their Dockerfiles as `hello-live:a` to `hello-live:e`, D rebuilt with no cache and its binary compared with the original's, the live D run and called, and a clean-up.
  - Run it: E's source (`go-patched/`) built and run straight on the VM, with its log; each image and the deployed digest run and called with curl; E run and its container inspected (user, capabilities, seccomp, as Docker's defaults leave them); a debug sidecar for the shell-less C, and a debug container, `docker cp` and the logs for E (`tools/debug-e.sh`); what an attacker finds in A and in B.
  - **E's fixes: D against E** (`tools/show-fixes.sh`): where the app's warnings were first seen (the step 5 log, findings F1, F2 and F8); D's and E's logs after a request with a forged `X-Forwarded-For` (Gin's debug-mode and trusted-proxies warnings, and the forged IP, in D only); half a request header, which D holds open and E closes after 5 s; and what changed from C to D (Go, every module, the builder), then from D to E (the app's settings). D and E have the same modules and both scan to zero.
  - The registry; scan reports, including image C on Chainguard's base against Google's distroless (step 28).
  - **Scan it live**: Docker Hub's `nginx` against Chainguard's, scanned straight from the registries; where Wolfi's security feed records the fix for Rapid Reset; Grype on C, D and E, all five counted, Trivy on D and E, C's image against its SBOM, govulncheck on both sources and on C's binary, one CVE explained, its KEV entry, and E against today's databases.
  - SBOM, signature and provenance; signing.
  - **Sign and deploy live**: the live-built E pushed to the registry as `hello-live`, verified, and offered to the cluster in dry runs, beside unsigned C.
  - Kubernetes: the two manifests that run E, numbered, and whether the cluster runs exactly them; `kubectl describe` of one E pod and the Deployment as the cluster holds it (YAML); E's logs in the cluster; an E pod deleted and replaced; `kubectl top` and `docker stats` (`tools/check-manifests.sh`: a server-side dry run, `kubectl diff`, the digest in the file, the cluster and the registry, and its signature); also E called through its Service, a shell attempted inside it, `kubectl debug` getting in under the restricted profile, the side door it opens (unsigned C, refused as a pod, admitted as a debug container), and Pod Security refusing E without security settings (a dry run). The two `kubectl debug` answers each delete the pod they used, and "Delete an E pod" does so on purpose; the deployment replaces it.
  - The pipeline; agent skills; the lab notes.

  Most are read-only. The three live groups write only throwaway things: `hello-live` images, the `hello-live` repository and its signature in the lab registry, and today's scanner databases in `/tmp`; the cluster checks are dry runs, which create nothing. The recorded images, digests, signatures and reports are never touched. Every command runs live on the build VM (one on the k3s VM) even in replay mode, and prints to the terminal; the filter box searches every tab at once. The definitions are in `actions/shortcuts.js`. The terminal takes the lower part of the page, with larger text, so the panel can read it.
- **Command deck** (`/deck`): the same commands as buttons only, 135 of them, for a second screen. The extra three need a person at the keyboard, so only the deck offers them: **Sign it with the lab key** (marked 🔑) asks for the key's password, which you type in the terminal on the shared screen, and **Open a shell inside A** and **inside B** (marked ⌨) leave you in a shell in that image until you type `exit`. A button types its command into a real terminal instead of this page's panel: by default the tmux session `show` on the build VM, which **Create the "show" session** starts if needed. On the shared screen, attach to it with `ssh -t chainguard-lab tmux new -A -s show` and keep it full screen. The target list also offers every other tmux pane on the VM and the Mac's open Terminal and iTerm windows; **Press Enter for me** runs the command, or leave it off to type it and press Enter yourself (Terminal windows always need it on). Every command is written for the lab folder, with Go on the PATH, which a plain shell on the VM lacks: the first time the deck types into a tmux pane it sets both up with one line, in plain sight (`cd ~/chainguard-technical-challenge; export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"`), and after that it only types the `cd` if the shell has moved. The one k3s command stays on the presentation page.

## Run it

On the Mac, from the lab checkout, in your own terminal (the agent's command-line tool needs your normal login environment):

```bash
node demo/console/server.js
```

Then open <http://127.0.0.1:8077/>. Stop it with Ctrl+C. It needs Node 18 or newer and nothing else: no packages to install.

Inside the Claude desktop app's terminal panel, start it with a clean environment, as at step 21:

```bash
env -i HOME="$HOME" PATH="$PATH" USER="$USER" TERM="$TERM" node demo/console/server.js
```

## Live and replay

- **Live** runs the real commands: `git` and `gh` on the Mac against the private `hello-ai` repo, the coding agent headless on the Mac, and `multipass exec` into the build VM for everything else.
- **Replay** runs nothing. Steps that change something play back the recorded lab run of 16 November 2026 (from `logs/` and `ci/agent-runs/`); the presentation proofs show the lab's own screenshot of the same check. Read-only CI steps (the cluster, the refused image, the app) always run live.
- In live mode, the two agent steps also have **Use the lab's recorded change**, which skips the agent and applies its change from the lab: the fallback if the agent is slow or offline on the day.

## Play all

**▶ Play all** in the CI page's header runs every step in order, hands-off, in the current mode, with a pause of 2.5 seconds between steps so each result can be seen in the diagram and the terminal.

- **Replay** starts at once and plays the recorded run of steps 0 to 11, then step 12's Chainguard view.
- **Live** first asks how to run the two agent steps (the agent live, or its recorded change), then runs the checks and steps 0 to 12 on the lab. Steps 6 and 8, the review and push and the merge, run without stopping for a person.
- Play stops at the first step that fails, stops before the merge if the gate is still red after the agent's fix, and skips steps 4 to 7 (the skill gate and the fix) if the gate passes first time.
- **Pause** holds before the next step; **Stop** ends Play and stops the step that is running. Reloading the page also ends Play, after the step that is running.

**Hide steps** hides the step list, so the diagram and the terminal use the full width.

## Before the demo

On the CI page, under "Before the demo, and fallbacks":

1. **Use the personal gh account** if the check shows another one: `hello-ai` belongs to the personal account, and the project keeps `gh` on it.
2. **Run the checks**: the VMs, the gh account, the runner, the admission policy, the deployed app, Grype's database, the `hello-ai` clone and the agent's tool. All should be green.
3. **Start the runner** if the check says it's offline; **Warm the caches** runs the gate once on the VM so images and Grype's database are ready.
4. **Check the agent can log in**.

After the demo: **Clean up after a run** closes the demo pull request if it's still open, deletes its branch and puts the Mac clone back on `main`. `gh` stays on the personal account, which this project uses; **Back to the work gh account** is there only if you need that account for other work.

## Safety

- It listens on `127.0.0.1` only.
- Every command is fixed in `actions/ci.js` and `actions/present.js`: nothing typed in the browser is executed.
- Each request that runs something must carry a random token generated at start-up and served only in the page, and must come from the page's own origin.
- One action runs at a time; **Stop** ends it and everything it started.
- The agent's tools are allowlisted per step (files only for the first change; files, the vetted skill, read-only `gh`, `dfc` and `crane` for the fix). `git` is denied outright (`--disallowedTools`): a person commits, pushes and merges. It runs with `--setting-sources project,local`, so it sees only the repo's skills, not the operator's.
- The command deck sends only the fixed commands in `actions/shortcuts.js`, by id; it types into tmux with `send-keys -l` and into Terminal or iTerm through AppleScript arguments, never through a shell string built from the browser.
- Each server start makes a new token. A page left open from an earlier start is refused; it shows "disconnected: waiting for the server…", checks every few seconds, and reloads itself to pick up the new token. A stream that merely drops shows "reconnecting…" while the browser retries.
- The merge and clean-up buttons ask for confirmation in live mode.

## Files

| File | What it is |
|---|---|
| `server.js` | The HTTP server, the event stream and the action runner |
| `config.js` | Names and addresses (repo, VMs, registry); each can be overridden by an environment variable |
| `actions/ci.js` | The CI demo's steps: live commands, recorded replays and the mapping text |
| `actions/present.js` | The presentation's sections and their read-only proofs |
| `actions/shortcuts.js` | The 135 quick answers, shared by the presentation page (132) and the command deck (135) |
| `actions/chainguard.js` | Chainguard's products and their statuses (checked 17 November 2026), for the diagram's switch, step 12 and the presentation's table |
| `deck.js` | The command deck: finds the terminals it can type into, and types a fixed command into one |
| `public/` | The three pages, their scripts and the shared style |

The run state (branch, pull request number, last results) is kept in `.state.json`, which isn't committed.
