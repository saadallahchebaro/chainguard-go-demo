# The agent's fix with a vetted skill (rehearsal, 17 November 2026, lab step 24)

An offline rehearsal of demo console step 5 after the skill gate (step 4) was added. Nothing touched GitHub.

- **Input:** hello-ai at the agent's unguarded commit `ae66f6f` (python:3.13-slim, which failed base image, base signed and scan), in a throwaway Git repo on the Mac, with `ci/skills/vetted/chainguard-dockerfile/` installed as `.claude/skills/chainguard-dockerfile/` after the skill gate allowed it.
- **Prompt:** [prompt.txt](prompt.txt): the gate's failed lines, then "Fix only what the gate reports, following the chainguard-dockerfile skill", the port the deployment expects, and what not to touch. The general instructions that the lab's fix prompt carried in step 21 (dfc, crane digest, crane config, the free registry's two tags, the review notes on user 65532 and the minimal runtime) now live in the skill instead.
- **The agent:** headless, `--setting-sources project,local` (so it ignores the user's own settings, plugins and skills), tools `Read,Edit,Write,Glob,Grep,Skill` plus `multipass exec chainguard -- dfc`, `crane digest` and `crane config`. It loaded the skill first, ran dfc, read both digests and the image configurations, corrected dfc's suggestion of tags the free registry does not serve, and wrote [Dockerfile](Dockerfile) ([diff](Dockerfile.diff)). It finished in 57 seconds; 5 requests outside the allowlist were refused, including `docker build`.
- **Result:** gate.sh on the build VM: [gate.txt](gate.txt), **GATE PASS, 7 of 7**, on the first run. The image started and answered `{"message":"Hello AI!"}` on port 8080. In step 21, without the skill, the same fix took two agent runs and a review round.

The rehearsal's image and folder were removed from the build VM afterwards.
