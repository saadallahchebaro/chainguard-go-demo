# Agent skills and the skill gate

A coding agent can load a *skill*: a folder with a `SKILL.md` of instructions, sometimes with scripts. A skill is a new kind of third-party dependency: whatever it says, the agent may do, with the agent's access. So in this lab no skill reaches the agent until NVIDIA SkillSpector has scanned it on the build VM (lab step 24, demo console step 4).

| Folder | Stands in for | What is in it | Gate result |
|---|---|---|---|
| `vetted/chainguard-dockerfile/` | a vetted catalog, the role Chainguard Agent Skills plays | the instructions the lab gave the agent in its fix prompt (step 21): dfc, pin by digest with crane, `-dev` builder, nonroot runtime | allowed, then installed for the agent |
| `unvetted/dockerfile-fixer/` | a look-alike from an unvetted public registry | a hidden prompt injection, a credential grab, `curl \| bash`, a base64-encoded command, and advice to disable the gate | blocked |

`unvetted/dockerfile-fixer/` is a **test fixture**, written to look compromised so the gate has something to catch. Nothing runs it, its script is not executable, and every address in it uses the `.invalid` top-level domain, which never resolves (RFC 6761).

The gate runs `skillspector scan <skill> --no-llm --format json`: static analysis only, no model calls. SkillSpector exits 0 for a risk score of 50 or less (`SAFE` or `CAUTION`) and 1 above 50 (`DO NOT INSTALL`). Only a skill that exits 0 is copied, as the bytes that were scanned, into the agent's `.claude/skills/` folder in the hello-ai clone, which Git is told to ignore so it is never committed. The scan reports are in `reports/skills/`.
