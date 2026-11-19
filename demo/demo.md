# Live demo run sheet

The core lab is shown from screenshots and the repo; this sheet covers the one part worth running live: an agent in
the pipeline (lab steps 20 and 21). About 4 minutes. Every step has a fallback.

## With the demo console

Every step below is also a button in the demo console (`demo/console/`, see its README): start it with `node demo/console/server.js` and open <http://127.0.0.1:8077/ci>. Its checks cover the table below, its steps 0 to 11 are the run below (step 4, the skill gate, was added at JOURNAL step 24) and step 12 is the Chainguard map of the same pipeline, with no commands (JOURNAL step 25), each step streams its commands and output into a terminal panel, **▶ Play all** runs every step in order without a click per step, and Replay plays back the recorded lab run if anything fails on the day. Its second page, <http://127.0.0.1:8077/present>, runs the read-only proofs behind the deck's deep-dive slides. The full flow was run end to end through the console on 16 November 2026 (JOURNAL step 23), and again live with the skill gate on 17 November (JOURNAL step 24).

### Questions on the shared screen

For questions, the command deck (<http://127.0.0.1:8077/deck>) stays on the laptop and types each answer into a real terminal on the shared screen:

1. On the laptop, open the deck and press **Create the "show" session** (once).
2. On the shared screen, open a terminal and attach: `ssh -t chainguard-lab tmux new -A -s show` from a Mac terminal, or, in VS Code with the lab workspace open over Remote-SSH, a new terminal with the profile **Command deck: show session**. Make the font large.
3. Pick a button: its command is typed into that terminal and run, and the output stays there for follow-up questions, typed by hand.

For "can you show me?", three groups run it live under throwaway names, so the recorded evidence stays as it was. **Build it live** rebuilds A to E as `hello-live` tags, with D rebuilt from scratch to the same binary. **Scan it live** scans with Grype, Trivy and govulncheck, and scans E against today's database. **Sign and deploy live** pushes the live E, signs it, and asks the cluster in dry runs. To sign (🔑), type the key's password at cosign's prompt on the shared screen. In order: build E, push, verify (refused), would the cluster run it (refused), sign, verify (OK), would the cluster run it (admitted). Then **Remove the live builds**.

For "what did you fix in the app?", **E's fixes: D against E** shows the warnings in the app's first run (step 5), then D and E live: their logs after a forged client IP, a half-sent request, and every component that changed from C to D, then D to E.

If the deck isn't reachable, the same commands (all but the one that asks for the signing password) are on the presentation page's **Show me: quick answers**, and they print in its own terminal panel.

## The day before, and again that morning

| Check | Command | Fallback |
|---|---|---|
| Both VMs running | `multipass start chainguard k3s`, then `multipass list` | — |
| The tmux session and the runner | `multipass shell chainguard`, `tmux attach -t lab`; window `runner` shows "Listening for Jobs". If not: `tmux new-window -d -n runner -t lab "cd ~/actions-runner && ./run.sh 2>&1 \| tee -a ~/ci/runner.log"` | The Git hook (below) needs no runner |
| `gh` on the personal account | `gh auth switch --user saadallahchebaro`; its scopes include `workflow` | — |
| The agent CLI logged in | In your own Terminal app: `claude -p "say ok"`. Inside the Claude desktop app's terminal, start it with a clean environment: `env -i HOME="$HOME" PATH="$PATH" USER="$USER" TERM="$TERM" claude -p …` | Screenshots `21-*.png` and `ci/agent-runs/` |
| Warm caches | Run the gate once on the VM (`cd ~/hello-ai && GATE_COMMIT=warmup000000 ./gate.sh`) so base images are pulled. Grype keeps the recorded database of 16 November: the VM user's `~/.config/grype/config.yaml` turns its updates and age check off (step 38) | — |
| Cluster policy | `kubectl get imagevalidatingpolicies` shows `require-lab-signature` READY | Say the policy exists and show `20-kyverno-signed-vs-unsigned.png` |

## Before the talk: the red pull request

1. In the `hello-ai` clone on the Mac: `git switch -c demo-unguarded main`.
2. Put the unguarded agent's files in place: `cp ../lab/ci/agent-runs/run-b-no-rules/{Dockerfile,.dockerignore} .` (or run the agent live in a folder holding only `app/` and `requirements.txt`, with the request from `ci/agent-runs/README.md`).
3. Commit, push, open the pull request: `gh pr create --repo saadallahchebaro/hello-ai --head demo-unguarded --base main --title "Add a Dockerfile"`.
4. Wait for the red cross: `FAIL base image`, `FAIL base signed`, `FAIL scan`.

## Live

| Time | Do | The panel sees | If it goes wrong |
|---|---|---|---|
| 0:00 | Open the failed check on the pull request | The gate's FAIL lines: not a Chainguard base, no signature, two fixable High CVEs in Debian's `zlib1g` | `21-runner-agent-pr-failed.png` |
| 0:30 | The skill gate: `bash ci/skills/skill-gate.sh` on both candidate skills, on the VM (console step 4) | `dockerfile-fixer` BLOCKED at risk 100/100 (a hidden prompt injection, `curl \| bash`, base64-encoded code); `chainguard-dockerfile` ALLOWED at 0/100 and copied into `hello-ai/.claude/skills/`, its hash checked | `24-skill-gate-blocked.png`, `24-skill-gate-allowed.png` |
| 1:00 | Run the agent with the short prompt and the skill (`ci/agent-runs/skill-run/prompt.txt`; tools: files, `Skill`, `gh pr checks`, `gh run view`, `dfc` and `crane` on the VM; `--setting-sources project,local`; git denied) | It loads the skill, reads the log, runs `dfc`, pins digests with `crane`, reads the image config, edits the Dockerfile; it can't push | Without the skill: `fix-instruction.txt` + `review-instruction.txt` in one go; or show `ci/agent-runs/review-run.diff` |
| 2:00 | Review the diff (`git diff`), commit and push | The runner window picks up the job; the check turns green | `21-runner-agent-green.png` |
| 2:45 | Merge (a person's decision) | The deploy job: gate again, push, sign, rollout | `21-agent-change-deployed.png` |
| 3:15 | Try to run an unsigned image: `kubectl run bypass -n bypass-test --image=192.168.252.2:5000/hello-ai@<unsigned digest>` | Kyverno: "The image must be signed with the lab key" | `20-pipeline-deployed-bypass-refused.png` |
| 3:40 | Call the app through `kubectl port-forward svc/hello-ai 8086:8080` | `{"message":"Hello AI!"}` | `21-agent-change-deployed.png` |
| 4:00 | Console step 12, **Where Chainguard fits** (no commands) | The same pipeline as a map: each part tagged by the Chainguard product that replaces it, adds to it or works with it, with its status, and the three parts that stay yours: signing your own image, your registry and admission control | — |

If GitHub or the network fails: push to the bare repository on the VM instead, `git push local HEAD:refs/heads/demo`. The
`pre-receive` hook runs the same gate and refuses a failing push (`21-git-hook-fallback.png`).

## What to say about it

- Agents follow the rules they can see: with the gate described in the repo, the agent complied without being told; with no rules in view, it made reasonable generic choices that the gate refused.
- The gate caught what it checks and missed what it doesn't: it never starts the container, so an entrypoint and a port bug only surfaced in review (the agent flagged one itself). A real gate also runs the image.
- A skill is a dependency that acts with the agent's permissions: the look-alike was blocked before the agent could load it, and the vetted one, carrying the lab's review notes, let the agent fix the Dockerfile in one run.
- Every piece here is hand-built from free tools; each maps to a Chainguard product (statuses as of 17 November 2026): the agent's sandbox (Workspaces, beta), the gate (Checks, beta), the image lookup (MCP servers, generally available), the vetted skill (Agent Skills, beta), the packages (Libraries, generally available for Python), the workflows' actions (Actions, generally available). The Chainguard switch on the console's diagram shows each one in place.
