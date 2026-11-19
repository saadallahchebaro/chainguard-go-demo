# ci/agent-runs/: what the coding agent was asked, what it wrote, and what the gate said (step 21)

The agent ran headless on the Mac (`claude -p`), each time as a fresh session with no memory of earlier runs, and
with only the tools listed. It never had `git`, so a person reviewed each change and pushed it.

| Run | Instruction | Tools allowed | What it did | Gate |
|---|---|---|---|---|
| A, rules visible | "Write a Dockerfile for this FastAPI service, and add httpx as a dependency for outbound HTTP calls." In the `hello-ai` clone, with the Dockerfile removed | read and write files | Rebuilt the Chainguard Dockerfile (same pinned digests) and pinned `httpx` 0.28.1 and `httpcore` 1.0.9 from memory, following the rules in `README.md` and `gate.sh` | not pushed: evidence only (`run-a-rules-visible/`) |
| B, no rules | The same words, in a folder holding only `app/` and `requirements.txt` | read and write files | `python:3.13-slim` in two stages, a named user `app`, port 8000, a `.dockerignore`; pinned the same two packages | **red** on PR #2: base image, base signed, scan (`run-b-no-rules/`) |
| Fix 1 | `fix-instruction.txt`: read the failed log, fix only what the gate reports, use `dfc` and `crane` | files; `gh pr checks`, `gh run view`, `gh run list`; `dfc` and `crane digest` on the VM | Diagnosed all three failures, then stopped: `dfc` and `crane` weren't on the VM's non-interactive PATH. Changed nothing (`fix-run-1-tools-missing.txt`) | — |
| Fix 2 | the same instruction, tools now reachable | the same | `dfc --org chainguard`, then `latest-dev` pinned by `crane digest` in both stages (dfc's `3.13-dev` tag isn't on the free tier); kept creating the `app` user; flagged that the image's entrypoint is `python` | **red**: `build` (`addgroup: permission denied`) |
| Review | `review-instruction.txt`: the build error (the gate hides it) and two review notes: minimal runtime image, and the container must start on 8080 | files; `gh`; `crane digest` and `crane config` on the VM | Runtime on `python:latest`, user creation removed, venv moved to `/app` (anticipating the next failure), `ENTRYPOINT` set to the venv's uvicorn on 8080 after reading the image config | **green** 7/7; the image runs and answers on 8080 |

The pull request with runs B, fix 2 and the review fix is `saadallahchebaro/hello-ai#2`, merged as `718b24a`.
