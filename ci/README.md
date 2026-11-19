# ci/: the pipeline bonus (step 20)

A snapshot of the private repository `saadallahchebaro/hello-ai` at commit `718b24a`, so the lab repo shows exactly
what ran, plus the helper that pinned its dependencies.

- `hello-ai/`: the FastAPI service, `gate.sh` (seven checks), `deploy.sh` (push, sign, deploy), the two workflows,
  the Kubernetes manifests and the Kyverno policy that admits only images signed with the lab key.
- `agent-runs/`: what the coding agent was asked, what it wrote and what the gate said (step 21).
- `git-hook/pre-receive`: the fallback, the same gate run by a Git hook on a bare repository on the VM.
- `resolve.py`: pins every installed Python package, transitive ones included, to the newest release at least 7 days
  old. Runs inside `cgr.dev/chainguard/python:latest-dev`: `docker run --rm -v ~/ci:/ci:ro <image> /ci/resolve.py [extra packages]`.

The runs, all on the self-hosted runner `chainguard-build-vm` on the build VM:

| Run | Trigger | Gate | Result |
|---|---|---|---|
| 43900507141 | push to `main`, `33ba9d7` (the starting version) | 7/7 pass | signed `hello-ai@sha256:e8432af9…`, deployed, 2/2 |
| 43900923691 | pull request #1, `83dddcb` (`requests>=2.32`) | `FAIL pinned deps` | red |
| 43901351577 | pull request #1, `9c0c6d7` (every package pinned) | 7/7 pass | green |
| 43901822133 | merge to `main`, `bb04be2` | 7/7 pass | signed `hello-ai@sha256:3eac2b17…`, rolled out (revision 2) |
| 43906208662 | pull request #2, `ae66f6f` (the agent's unguarded change) | `FAIL base image`, `FAIL base signed`, `FAIL scan` | red |
| 43907148612 | pull request #2, `7c0e39f` (the agent's first fix) | `FAIL build` | red |
| 43907723782 | pull request #2, `57a4ec4` (the agent's fix after review) | 7/7 pass | green |
| 43908366650 | merge to `main`, `718b24a` | 7/7 pass | signed `hello-ai@sha256:ba805fe2…`, rolled out (revision 3) |

Details: JOURNAL.md steps 20 and 21, `logs/20-ci*.log`, `logs/21-agent*.log`.
