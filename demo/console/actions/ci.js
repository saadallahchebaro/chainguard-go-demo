// demo/console/actions/ci.js: the CI demo, an agent in the pipeline. Each step runs the real commands
// (live) or plays back the recorded lab run of 16 November 2026 (replay). Replays exist only for steps that
// change something; read-only steps (the cluster, the refused image, the app) always run live.
'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('../config');

const R = CFG.repo;
const agentRuns = path.join(CFG.lab, 'ci', 'agent-runs');
const readRec = (f) => { try { return fs.readFileSync(path.join(agentRuns, f), 'utf8').split('\n').filter((l) => !/^\[mcp-sdk\]/.test(l)).join('\n').trim(); } catch { return '(recording not found)'; } };

const AGENT_TOOLS_WRITE = 'Read,Write,Edit,Glob,Grep';
const AGENT_TOOLS_FIX = 'Read,Edit,Write,Glob,Grep,Bash(gh pr checks:*),Bash(gh run view:*),Bash(gh run list:*),' +
  'Bash(multipass exec chainguard -- dfc:*),Bash(multipass exec chainguard -- crane digest:*),Bash(multipass exec chainguard -- crane config:*)';
const WRITE_REQUEST = 'Write a Dockerfile for this FastAPI service, and add httpx as a dependency for outbound HTTP calls.';
const BEFORE_AGENT = 'bb04be2';            // hello-ai before the agent's pull request: the input the agent saw in the lab
const AGENT_FIXED = '57a4ec4';             // the agent's reviewed fix, as merged in the lab

function fixPrompt(pr) {
  return `The "gate" check on pull request #${pr} of ${R} failed. Find the run with \`gh pr checks ${pr} --repo ${R}\` and read the failed job's log with \`gh run view <run id> --repo ${R} --log-failed\`. ` +
    'Fix only what the gate reports, in the smallest change that works. Use `dfc` to convert the Dockerfile and `crane digest` to pin each base image. ' +
    'Both tools are on the build VM: run `multipass exec chainguard -- dfc --org chainguard - < Dockerfile` and `multipass exec chainguard -- crane digest <image>`. ' +
    'You can read an image\'s configuration with `multipass exec chainguard -- crane config <image>`. The free Chainguard registry, cgr.dev/chainguard, only serves the :latest and :latest-dev tags. ' +
    'Review notes from an earlier round: Chainguard images run RUN steps as user 65532, so a step that creates users or writes outside a directory that user owns fails; ' +
    'the runtime stage should be the minimal Chainguard Python image, not the -dev one; and the container must start and listen on port 8080, which k8s/deployment.yaml expects. ' +
    'Don\'t edit gate.sh or anything under .github/. Don\'t commit or push: leave your changes in the working tree, and say what you changed.';
}

// The skill gate (step 4): two candidate skills, scanned on the build VM by NVIDIA SkillSpector before the agent may load one
const SKILLS = [
  { path: 'ci/skills/unvetted/dockerfile-fixer', name: 'dockerfile-fixer', from: 'an unvetted public registry' },
  { path: 'ci/skills/vetted/chainguard-dockerfile', name: 'chainguard-dockerfile', from: 'the vetted catalog' },
];
const SKILL_NAME = 'chainguard-dockerfile';
const skillDir = () => path.join(CFG.helloAi, '.claude', 'skills', SKILL_NAME);
const skillInstalled = () => fs.existsSync(path.join(skillDir(), 'SKILL.md'));
// With the skill installed, the prompt keeps only what is specific to this repo; the know-how is in the skill
function fixPromptSkill(pr) {
  return `The "gate" check on pull request #${pr} of ${R} failed. Find the run with \`gh pr checks ${pr} --repo ${R}\` and read the failed job's log with \`gh run view <run id> --repo ${R} --log-failed\`. ` +
    'Fix only what the gate reports, following the chainguard-dockerfile skill. The container must start and listen on port 8080, which k8s/deployment.yaml expects. ' +
    'Don\'t edit gate.sh or anything under .github/. Don\'t commit or push: leave your changes in the working tree, and say what you changed.';
}
const skillRecord = (name) => readFile(path.join(CFG.lab, 'reports', 'skills', `${name}.txt`)).trim().split('\n');

// Step 12: no commands, only the Chainguard view (the page switches the diagram) and its rows in the result card
const CG = require('./chainguard');
const cgRows = () => CG.view.map((v) => [v.verb.toUpperCase(), v.product ? `${v.product.name} (${v.product.cell})` : 'not Chainguard', v.change]);
const cgViewScript = () => [
  ['note', `No commands in this step: the diagram shows where Chainguard's products fit (statuses checked ${CG.CHECKED}).`],
  ['result', { status: 'info', title: 'Where Chainguard fits in this agentic build', rows: cgRows() }],
];
function cgView(ctx) { for (const [k, v] of cgViewScript()) { if (k === 'result') ctx.result(v); else ctx.say(v, k); } }

const KEY = /^(FROM|USER|EXPOSE|CMD|ENTRYPOINT|RUN)/;
const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const keyLinesOf = (text) => text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => KEY.test(l)).map(([n, l]) => `${n}: ${l}`);
function dockerDiff(oldText, newText) {
  const o = oldText.split('\n').filter((l) => KEY.test(l)), n = newText.split('\n').filter((l) => KEY.test(l));
  return [...o.filter((l) => !n.includes(l)).map((l) => '-' + l), ...n.filter((l) => !o.includes(l)).map((l) => '+' + l)];
}
const RUN_B_DOCKERFILE = () => readFile(path.join(agentRuns, 'run-b-no-rules', 'Dockerfile'));
const FIXED_DOCKERFILE = () => readFile(path.join(CFG.lab, 'ci', 'hello-ai', 'Dockerfile'));   // the merged state of hello-ai (718b24a)

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');   // 20261116-2130

// ---------- GitHub Actions helpers ----------
async function findRun(ctx, workflow, branch, sha, timeoutMs = 150000) {
  ctx.say(`waiting for GitHub to start the "${workflow.replace('.yml', '')}" workflow for ${sha.slice(0, 7)} …`, 'note');
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (ctx.cancelled()) return null;
    const r = await ctx.gh(['run', 'list', '--repo', R, '--workflow', workflow, '--branch', branch, '--limit', '10', '--json', 'databaseId,headSha,status,conclusion'], { quiet: true, silentCmd: true });
    try { const m = JSON.parse(r.out).find((x) => x.headSha === sha); if (m) return m; } catch {}
    await ctx.sleep(3000);
  }
  ctx.say('no run appeared: is the runner online? (Checks, at the top)', 'fail');
  return null;
}

async function watchRun(ctx, id) {
  ctx.say(`gh run watch ${id} --repo ${R}`, 'cmd');
  const seen = new Set();
  while (!ctx.cancelled()) {
    const r = await ctx.gh(['run', 'view', String(id), '--repo', R, '--json', 'status,conclusion,jobs'], { quiet: true, silentCmd: true });
    let v; try { v = JSON.parse(r.out); } catch { await ctx.sleep(3000); continue; }
    for (const j of v.jobs || []) {
      for (const s of j.steps || []) {
        const st = s.status === 'completed' ? s.conclusion : s.status;
        const key = `${j.name}/${s.name}/${st}`;
        if (!seen.has(key)) { seen.add(key); ctx.say(`${j.name} › ${s.name}: ${st}`, st === 'failure' ? 'err' : 'dim'); }
      }
    }
    if (v.status === 'completed') { ctx.say(`run ${id}: ${v.conclusion}`, v.conclusion === 'success' ? 'ok' : 'fail'); return v; }
    await ctx.sleep(3000);
  }
  return null;
}

async function keyLines(ctx, id) {
  const r = await ctx.gh(['run', 'view', String(id), '--repo', R, '--log'], { quiet: true, label: `gh run view ${id} --repo ${R} --log   (the gate's lines)` });
  const out = [];
  for (const raw of r.out.split('\n')) {
    const l = raw.replace(/^[^\t]*\t[^\t]*\t\S+Z /, '').trimEnd();
    if (/^(PASS|FAIL)  |^GATE (PASS|FAIL)|^SIGNED |^DEPLOYED |successfully rolled out/.test(l) && !out.includes(l)) out.push(l);
  }
  for (const l of out) ctx.say(l, /^FAIL|GATE FAIL/.test(l) ? 'fail' : /^PASS|GATE PASS|^SIGNED|^DEPLOYED|rolled out/.test(l) ? 'ok' : 'out');
  return out;
}

function gateCard(ctx, lines, extra = {}) {
  const verdict = lines.find((l) => /^GATE /.test(l)) || 'no verdict';
  const rows = lines.filter((l) => /^(PASS|FAIL)  /.test(l)).map((l) => [l.slice(0, 4), l.slice(6, 18).trim(), l.slice(19).trim()]);
  ctx.result(Object.assign({ status: /PASS/.test(verdict) ? 'pass' : 'fail', title: verdict, rows }, extra));
}

const gateReplay = (lines, sha, run) => [
  ['cmd', `gh run watch ${run} --repo ${R}`], [/GATE PASS/.test(lines.join()) ? 'ok' : 'fail', `run ${run}: ${/GATE PASS/.test(lines.join()) ? 'success' : 'failure'}`],
  ['cmd', `gh run view ${run} --repo ${R} --log   (the gate's lines)`],
  ...lines.map((l) => [/^FAIL|GATE FAIL/.test(l) ? 'fail' : 'ok', l]),
];

const L_UNGUARDED = ['FAIL  base image   FROM python:3.13-slim AS builder', 'FAIL  base signed  Chainguard\'s signature on each base image', 'PASS  pinned deps  every line is name==version', 'PASS  cooldown     nothing newer than 7 days', 'PASS  build        docker build', 'PASS  user         runs as app', 'FAIL  scan         no fixable high or critical finding', 'GATE FAIL for ae66f6f'];
const L_FIX1 = ['PASS  base image   all from cgr.dev/chainguard, pinned by digest', 'PASS  base signed  Chainguard\'s signature on each base image', 'PASS  pinned deps  every line is name==version', 'PASS  cooldown     nothing newer than 7 days', 'FAIL  build        docker build', 'GATE FAIL for 7c0e39f'];
const L_PASS = (sha) => ['PASS  base image   all from cgr.dev/chainguard, pinned by digest', 'PASS  base signed  Chainguard\'s signature on each base image', 'PASS  pinned deps  every line is name==version', 'PASS  cooldown     nothing newer than 7 days', 'PASS  build        docker build', 'PASS  user         runs as 65532', 'PASS  scan         no fixable high or critical finding', `GATE PASS for ${sha}`];
const rowsOf = (lines) => lines.filter((l) => /^(PASS|FAIL)  /.test(l)).map((l) => [l.slice(0, 4), l.slice(6, 18).trim(), l.slice(19).trim()]);

// ---------- the steps shown on the page ----------
const T = (id) => STEPS.find((x) => x.id === id).title;
const STEPS = [
  {
    id: 'ci-branch', short: 'Clean branch', n: 0, title: 'Start a clean branch', lane: 'mac', nodes: ['mac-me'],
    what: 'A new branch from main in the hello-ai clone on the Mac, so every run of the demo starts from the merged, known-good state.',
    lab: 'git fetch, then git switch -C demo-<time> origin/main in the Mac clone of the private hello-ai repo.',
    enterprise: 'Every change starts on a branch; main only changes through a reviewed pull request.',
    chainguard: 'Guardener (early access, a Technology Preview): an AI migration agent and GitHub App that moves workflows onto hardened actions and images onto Chainguard, and verifies commits.',
    ai: 'An agent works on a branch the same way a person does: the branch is what a reviewer reads.',
  },
  {
    id: 'ci-agent-write', short: 'Agent writes a change', n: 1, title: 'The agent writes a change, with no rules in view', lane: 'mac', nodes: ['mac-agent'], agent: true,
    what: `One plain request to a coding agent, in a folder that holds only the app (as it was before the agent's pull request in the lab): "${WRITE_REQUEST}" Its tools are the file tools only, though the agent\'s own tool still lets read-only shell commands such as ls and cat through (surprise 50).`,
    lab: 'In the lab it wrote a reasonable two-stage Dockerfile on python:3.13-slim, with a named user and port 8000, and pinned httpx. Asked inside the repo, where README.md and gate.sh describe the rules, it complied unasked instead (surprise 42).',
    enterprise: 'Coding agents in editors and terminals now write a large share of changes, faster than people can review them. Their defaults (base image, registry, package source) decide the security of what they build.',
    chainguard: 'Workspaces (beta): the agent works in a microVM; credentials stay outside it and outbound traffic is denied by default. Chainguard\'s MCP servers (generally available): the agent checks images, SBOMs, provenance and end-of-life dates itself. Agent Skills (beta): reviewed, hardened and signed skills.',
    ai: 'Agents follow the rules they can see. Whoever sets an agent\'s defaults sets the security of everything it builds.',
  },
  {
    id: 'ci-open-pr', short: 'Open the pull request', n: 2, title: 'A person commits it and opens the pull request', lane: 'gh', nodes: ['mac-me', 'gh-pr'], edges: ['e-agent-me', 'e-agent-pr'],
    what: 'The agent can\'t commit or push: a person commits its change, pushes the branch and opens a pull request with gh. GitHub then hands the gate job to the runner.',
    lab: 'git commit, git push, gh pr create on the private hello-ai repo. Git is denied to the agent outright, read-only commands included: in the live run of 17 November, read-only git let it read an earlier fix from the history (surprise 50).',
    enterprise: 'The pull request is the unit of review: required status checks, code owners and approvals attach to it.',
    chainguard: 'Guardener\'s GitHub App (early access) works on the repository itself: migrations to hardened images and actions, and commit verification.',
    ai: 'Keep publishing with people: the agent edits, a person decides what leaves the machine.',
  },
  {
    id: 'ci-gate', short: 'CI: the gate runs', n: 3, title: 'CI: the gate runs on the self-hosted runner', lane: 'vm', nodes: ['gh-check', 'vm-runner', 'vm-gate'], edges: ['e-pr-runner', 'e-runner-gate', 'e-gate-check'],
    what: 'GitHub Actions gives the job to the runner on the build VM, which runs gate.sh: seven checks, each PASS or FAIL. The check on the pull request turns red or green.',
    lab: 'The seven checks: base image is Chainguard and pinned by digest; Chainguard\'s signature verifies; every dependency pinned; nothing newer than 7 days on PyPI; it builds; it doesn\'t run as root; Grype finds no fixable high or critical CVE. In the lab the agent\'s change failed base image, signature and scan (two fixable High CVEs in Debian\'s zlib1g).',
    enterprise: 'Ephemeral runners, required status checks that block the merge, scanning and policy as code. On a free private repository GitHub refused the branch rule (HTTP 403), so here the check is visible but not enforced.',
    chainguard: 'Checks (beta): each check in a hardened microVM, with a signed attestation tied to the commit. Chainguard Actions (generally available): hardened drop-in GitHub Actions with their dependencies pinned. Containers: a base with almost nothing to find. Libraries: the packages rebuilt from source.',
    ai: 'Back-pressure: a "no" from outside the agent that it can\'t talk its way past.',
  },
  {
    id: 'ci-skill-gate', short: 'Skill gate: scan before use', n: 4, title: 'The agent needs a skill: the skill gate scans it first', lane: 'vm', nodes: ['mac-agent', 'vm-skillspector', 'mac-skill'], edges: ['e-skills-scan', 'e-skill-install'],
    what: 'To fix the Dockerfile the agent needs a skill. Two candidates: dockerfile-fixer from an unvetted public registry, and chainguard-dockerfile from a vetted catalog. NVIDIA SkillSpector scans each on the build VM; only a skill that passes is copied, as the bytes that were scanned, into the agent\'s skills folder.',
    lab: 'SkillSpector v2.13.4, static analysis only (no model calls). dockerfile-fixer: risk 100/100 CRITICAL, DO NOT INSTALL, 10 findings, among them a hidden prompt injection, curl | bash, a base64-encoded command, chmod 777 and --no-verify: blocked. chainguard-dockerfile: risk 0/100, SAFE: installed in hello-ai/.claude/skills, which Git ignores. The agent runs with project settings only, so it cannot load the user\'s own skills (step 24).',
    enterprise: 'Skills, MCP servers and agent plugins are dependencies that act with the agent\'s permissions. Treat them like packages: an allowlisted source, a scan before install, pinned by content hash, checked again when they change.',
    chainguard: 'Chainguard Agent Skills (beta; a Technology Preview under its terms): a catalog of third-party skills at skills.cgr.dev, reviewed against a security ruleset, fixed rather than only flagged, published with a HARDENING.md audit trail and signed with Sigstore. It scans before publication; this gate scans again where the skill is used.',
    ai: 'Whatever a skill says, the agent may do with its access: a skill is code that reads like documentation.',
  },
  {
    id: 'ci-agent-fix', short: 'Agent fixes it from the log', n: 5, title: 'The agent reads the failure and fixes it', lane: 'mac', nodes: ['mac-agent', 'gh-check'], edges: ['e-check-agent', 'e-skill-agent'], agent: true,
    what: 'The agent reads the failed job\'s log with read-only gh and fixes the Dockerfile with the vetted chainguard-dockerfile skill: dfc to convert it and crane digest to pin each base image, both on the build VM. Its tools are allowlisted and git is denied, so it can\'t read earlier fixes from the history (surprise 50).',
    lab: 'In the lab the first fix broke the build ("addgroup: permission denied"), and the gate printed only "FAIL build". Reproducing the build by hand found the cause, and two review notes finished it. Those review notes now live in the skill: in a rehearsal with it (step 24), the first run passed the gate 7 of 7 and the image answered on port 8080.',
    enterprise: 'Remediation bots (Dependabot, Renovate) and agents propose fixes; people approve them.',
    chainguard: 'dfc, Chainguard\'s open-source converter, rewrites a Dockerfile by rules; Guardener (early access) is the managed migration agent. Chainguard\'s MCP servers (generally available) let the agent check images and versions itself.',
    ai: 'An agent can only fix what the log tells it, so a gate has to show its evidence (F29).',
  },
  {
    id: 'ci-push-fix', short: 'Review and push', n: 6, title: 'A person reviews the diff and pushes', lane: 'mac', nodes: ['mac-me', 'gh-pr'], edges: ['e-agent-me', 'e-agent-pr'],
    what: 'Read the agent\'s diff, then commit and push it. The new commit starts the gate again.',
    lab: 'git diff, git commit, git push. In the lab the review also caught what the gate can\'t see: the image\'s entrypoint and port.',
    enterprise: 'Code owners and required reviews; nothing merges on an agent\'s say-so.',
    chainguard: 'Checks (beta): each commit\'s verdict is a signed attestation, evidence a reviewer can rely on.',
    ai: 'Review an agent\'s diff like any contributor\'s, and run the image before merging, because the gate doesn\'t start it (F29).',
  },
  {
    id: 'ci-gate-2', short: 'CI: the gate again', n: 7, title: 'CI again: the gate on the fixed commit', lane: 'vm', nodes: ['gh-check', 'vm-runner', 'vm-gate'], edges: ['e-pr-runner', 'e-runner-gate', 'e-gate-check'],
    what: 'The same seven checks on the new commit. Green means a Chainguard base pinned by digest and signed, pinned dependencies, non-root, and no fixable high or critical CVE.',
    lab: 'In the lab the reviewed fix (57a4ec4) passed 7 of 7.',
    enterprise: 'The same required check, now green; the merge button unlocks where the plan enforces it.',
    chainguard: 'Checks (beta): the verdict is signed and tied to the commit.',
    ai: 'The same bar for a person\'s change and an agent\'s.',
  },
  {
    id: 'ci-merge', short: 'Merge, sign, deploy', n: 8, title: 'Merge, then the pipeline signs and deploys', lane: 'vm', nodes: ['mac-me', 'gh-rule', 'vm-runner', 'vm-gate', 'vm-deploy', 'vm-registry', 'k8s-policy', 'k8s-pods'], edges: ['e-me-rule', 'e-rule-deploy', 'e-deploy-registry', 'e-deploy-admit', 'e-policy-pods', 'e-registry-pods'], confirm: 'Merge the pull request? The deploy job then pushes, signs and rolls the image out to k3s.',
    what: 'A person merges. The deploy workflow runs the gate again on what was merged, pushes the image to the lab registry, signs it by digest with cosign, and rolls out the Deployment with that digest.',
    lab: 'gh pr merge, then deploy.yml on the runner: gate.sh, then deploy.sh (docker push, cosign sign with the lab key and no transparency log, cosign verify, kubectl apply, rollout status).',
    enterprise: 'GitOps (Argo CD or Flux) applies the new digest from Git. Signing is keyless, with the pipeline\'s OIDC identity, and the SBOM and SLSA provenance are attached as signed attestations.',
    chainguard: 'Every Chainguard image arrives Sigstore-signed with an SBOM and SLSA provenance, and Custom Assembly images get the same under your organisation\'s identity. Signing your own application image stays the pipeline\'s job, as here.',
    ai: 'An agent\'s change becomes a signed artifact only after the same checks and the same person.',
  },
  {
    id: 'ci-cluster', short: 'The signed digest runs', n: 9, title: 'The cluster runs the signed digest', lane: 'k8s', nodes: ['k8s-policy', 'k8s-pods'], edges: ['e-policy-pods'],
    what: 'Read-only: the pods, the digest they run, a cosign verify of that digest with the lab key, and the admission policy.',
    lab: 'kubectl get pods; cosign verify --key cosign.pub on the deployed digest; the Kyverno ImageValidatingPolicy require-lab-signature (Kyverno v1.19.2).',
    enterprise: 'Admission control: Kyverno or Sigstore policy-controller checks the signature, the signing identity and the attestations before a pod runs.',
    chainguard: 'Admission is not a Chainguard product: its docs show Kyverno and OPA Gatekeeper policies that verify its signatures, the same kind of check as here.',
    ai: 'AI factories run on Kubernetes too: GPU operators, model servers and gateways are images, and the same checks apply.',
  },
  {
    id: 'ci-unsigned', short: 'Unsigned image refused', n: 10, title: 'An unsigned image is refused', lane: 'k8s', nodes: ['k8s-policy', 'k8s-refused'], edges: ['e-policy-refused'],
    what: 'Try to run the same app, pushed straight to the registry around the gate and never signed. Kyverno refuses it before a pod exists.',
    lab: `kubectl run with ${CFG.registry}/hello-ai@${CFG.unsignedDigest.slice(0, 19)}…, pushed at step 20 with one label added.`,
    enterprise: 'The cluster is the last gate: whatever bypasses the pipeline, a person or an agent, still can\'t run.',
    chainguard: 'No Chainguard product here: the cluster\'s admission policy does it. Chainguard\'s own images would pass a signature check like this one.',
    ai: 'If an agent pushes around the pipeline, the cluster still says no.',
  },
  {
    id: 'ci-call', short: 'Call the app', n: 11, title: 'Call the app', lane: 'k8s', nodes: ['k8s-pods'],
    what: 'Read-only: a port-forward to the Service and two requests, GET / and POST /ask.',
    lab: 'kubectl port-forward svc/hello-ai, then curl. Expected: {"message":"Hello AI!"}.',
    enterprise: 'Smoke tests after every deploy; runtime monitoring.',
    chainguard: 'Harness (beta, by waitlist): an AI model tests a live copy of the application for exploitable bugs, with fixes reviewed by engineers.',
    ai: 'Test the thing that actually runs, not just the files that built it.',
  },
  {
    id: 'ci-chainguard', short: 'Where Chainguard fits', n: 12, title: 'Where Chainguard fits in this agentic build', lane: 'all', nodes: [], view: true,
    what: 'No commands: the diagram switches to the Chainguard view. Each tag shows what a Chainguard product replaces or adds at that point of the pipeline, with its status, and where the pipeline stays yours.',
    lab: 'The lab already builds on Chainguard Containers (the free tier: :latest and :latest-dev). Everything else here was built by hand from free tools: the cooldown, the gate, the agent\'s limits, the skill gate.',
    enterprise: 'Buy what a supplier keeps current for you: images, packages, actions, skills. Keep what is yours: your signing identity, your registry, your admission policy.',
    chainguard: 'Statuses checked on chainguard.dev on 17 November 2026: Containers, Libraries for Python, Java and JavaScript, Actions and the MCP servers are generally available; Workspaces, Checks and Agent Skills are in beta, Technology Previews under Chainguard\'s terms; Guardener is in early access; Harness is a beta by waitlist; Factory 2.0 was announced in January 2026.',
    ai: 'An agentic build adds supply chains of its own on top of the images: the agent\'s environment (Workspaces), its skills (Agent Skills) and its tools (the MCP servers, Actions).',
  },
];

const EXTRAS = [
  {
    id: 'ci-hook', short: 'Git-hook fallback', title: 'Fallback: the same gate as a Git hook', nodes: ['vm-gate'],
    what: 'No GitHub? Push to a bare repository on the build VM: its pre-receive hook runs the same gate.sh and refuses a failing push.',
    lab: 'git push local <commit>:refs/heads/hook-<time> from the VM\'s hello-ai clone; the hook prints the gate\'s lines.',
    enterprise: 'Server-side hooks in GitLab or GitHub Enterprise; pre-commit hooks on laptops.',
    chainguard: 'Checks (beta) runs this kind of check in a hardened microVM, with a signed verdict.',
    ai: 'The rule lives where any push has to pass, whoever pushes.',
  },
  { id: 'ci-cleanup', short: 'Clean up', title: 'Clean up after a run', confirm: 'Close the open demo pull request (if any), delete its branch and switch the Mac clone back to main?' },
];

const CHECKS = [
  { id: 'preflight', short: 'Run the checks', title: 'Run the checks' },
  { id: 'gh-personal', short: 'Personal gh', title: 'Use the personal gh account' },
  { id: 'gh-work', short: 'Work gh', title: 'Back to the work gh account' },
  { id: 'runner-start', short: 'Start runner', title: 'Start the runner' },
  { id: 'warmup', short: 'Warm caches', title: 'Warm the caches (runs the gate once)' },
  { id: 'agent-check', short: 'Agent log-in', title: 'Check the agent can log in' },
];

// ---------- live implementations ----------
async function preflight(ctx) {
  const c = {};
  const vms = await ctx.run('multipass list', 'multipass', ['list', '--format', 'json'], { quiet: true });
  try {
    const list = JSON.parse(vms.out).list || [];
    const st = (n) => (list.find((v) => v.name === n) || {}).state || 'missing';
    c.vms = { ok: st(CFG.vm) === 'Running' && st(CFG.k3sVm) === 'Running', text: `${CFG.vm}: ${st(CFG.vm)}, ${CFG.k3sVm}: ${st(CFG.k3sVm)}` };
  } catch { c.vms = { ok: false, text: 'multipass not answering' }; }
  ctx.say(c.vms.text, c.vms.ok ? 'ok' : 'fail');

  const who = await ctx.gh(['api', 'user', '--jq', '.login'], { quiet: true });
  const login = who.out.trim();
  c.gh = { ok: login === CFG.ghUser, text: login ? `gh account: ${login}` : 'gh not logged in' };
  ctx.say(c.gh.text + (c.gh.ok ? '' : `  (the demo needs ${CFG.ghUser})`), c.gh.ok ? 'ok' : 'fail');

  const rn = await ctx.gh(['api', `repos/${R}/actions/runners`, '--jq', '.runners[] | .name + " " + .status + " " + (if .busy then "busy" else "idle" end)'], { quiet: true });
  const rl = rn.out.trim();
  c.runner = /^\{/.test(rl) || !rl
    ? { ok: false, text: `runner: not visible to this gh account (${(rl.match(/"message":"([^"]+)"/) || [])[1] || 'no answer'})` }
    : { ok: / online /.test(rl + ' '), text: `runner: ${rl}` };
  ctx.say(c.runner.text, c.runner.ok ? 'ok' : 'fail');

  const k = await ctx.vm('kubectl get imagevalidatingpolicies require-lab-signature --no-headers 2>&1 | head -1; ' +
    'echo "app=$(kubectl get deploy hello-ai -o jsonpath={.status.readyReplicas}/{.spec.replicas} 2>/dev/null)"; ' +
    'grype db status 2>/dev/null | grep -i -m1 built', { quiet: true, label: 'kubectl get imagevalidatingpolicies; kubectl get deploy hello-ai; grype db status' });
  const pol = k.out.split('\n')[0] || '';
  c.policy = { ok: /require-lab-signature/.test(pol) && !/NotFound|error/i.test(pol), text: `policy: ${pol.replace(/\s+/g, ' ').trim() || 'not found'}` };
  const app = (k.out.match(/app=(\S*)/) || [])[1] || '';
  c.app = { ok: /^(\d+)\/\1$/.test(app) && app !== '0/0', text: `hello-ai ready: ${app || 'not deployed'}` };
  const db = (k.out.split('\n').find((l) => /built/i.test(l)) || '').replace(/\s+/g, ' ').trim();
  c.db = { ok: !!db, text: `Grype database: ${db || 'unknown'}` };
  for (const x of [c.policy, c.app, c.db]) ctx.say(x.text, x.ok ? 'ok' : 'fail');

  const g = await ctx.git(['status', '--porcelain', '--branch'], { quiet: true, label: 'git status (hello-ai clone)' });
  const head = (g.out.split('\n')[0] || '').replace('## ', '');
  const dirty = g.out.split('\n').slice(1).filter(Boolean).length;
  c.clone = { ok: dirty === 0, text: `hello-ai clone: ${head}${dirty ? `, ${dirty} uncommitted file(s)` : ', clean'}` };
  ctx.say(c.clone.text, c.clone.ok ? 'ok' : 'note');

  const a = await ctx.sh(`command -v ${ctx.shq(CFG.agentBin)}`, { quiet: true, label: `is the ${CFG.agentLabel}'s command-line tool installed?` });
  c.agent = { ok: a.code === 0, text: a.code === 0 ? `${CFG.agentLabel}: installed (log-in checked separately)` : `${CFG.agentLabel}: ${CFG.agentBin} not found on PATH` };
  ctx.say(c.agent.text, c.agent.ok ? 'ok' : 'fail');
  ctx.checks(c);
  const bad = Object.values(c).filter((x) => !x.ok).length;
  ctx.result({ status: bad ? 'fail' : 'pass', title: bad ? `${bad} check(s) need attention` : 'Ready for the demo', rows: Object.entries(c).map(([k2, v]) => [v.ok ? 'OK' : 'NO', k2, v.text]) });
  return true;
}

async function prState(ctx) {
  if (!ctx.state.pr) return null;
  const r = await ctx.gh(['pr', 'view', String(ctx.state.pr), '--repo', R, '--json', 'state,headRefOid,headRefName,mergeCommit,url'], { quiet: true, silentCmd: true });
  try { return JSON.parse(r.out); } catch { return null; }
}

async function gateStep(ctx) {
  const b = ctx.state.branch;
  const head = await ctx.git(['rev-parse', 'HEAD'], { quiet: true, silentCmd: true });
  const sha = head.out.trim();
  if (!b || !ctx.state.pr) { ctx.say('open the pull request first (step 2)', 'fail'); return false; }
  ctx.stage(['gh-check', 'vm-runner'], ['e-pr-runner']);
  const run = await findRun(ctx, 'gate.yml', b, sha);
  if (!run) return false;
  ctx.stage(['vm-runner', 'vm-gate'], ['e-runner-gate']);
  const v = await watchRun(ctx, run.databaseId);
  if (!v) return false;
  const lines = await keyLines(ctx, run.databaseId);
  ctx.stage(['vm-gate', 'gh-check'], ['e-gate-check']);
  gateCard(ctx, lines, { link: `https://github.com/${R}/pull/${ctx.state.pr}` });
  ctx.state.lastGate = { sha: sha.slice(0, 7), pass: v.conclusion === 'success', run: run.databaseId };
  ctx.save();
  return true;
}

const actions = {
  'preflight': { title: 'Checks', live: preflight },
  'gh-personal': { title: 'gh: personal account', live: async (ctx) => (await ctx.gh(['auth', 'switch', '--hostname', 'github.com', '--user', CFG.ghUser], { errAs: 'ok' })).code === 0 },
  'gh-work': { title: 'gh: work account', live: async (ctx) => {
    if (!CFG.ghWorkUser) { ctx.say('no work account set: start the console with CONSOLE_GH_WORK_USER=<account>', 'fail'); return false; }
    return (await ctx.gh(['auth', 'switch', '--hostname', 'github.com', '--user', CFG.ghWorkUser], { errAs: 'ok' })).code === 0;
  } },
  'runner-start': {
    title: 'Start the runner',
    live: async (ctx) => {
      const r = await ctx.vm('if tmux list-windows -t lab -F "#W" | grep -qx runner; then echo "the runner window is already open in the lab session"; ' +
        'else tmux new-window -d -n runner -t lab "cd ~/actions-runner && ./run.sh 2>&1 | tee -a ~/ci/runner.log" && echo "runner started in tmux window lab:runner"; fi; sleep 5; ' +
        'tmux capture-pane -p -t lab:runner | grep -v "^$" | tail -3');
      return r.code === 0;
    },
  },
  'warmup': {
    title: 'Warm the caches',
    live: async (ctx) => {
      ctx.say('Runs gate.sh once on the build VM, on main: pulls the base images, checks their signatures and refreshes Grype\'s database, so the live gate is fast.', 'note');
      const r = await ctx.vm(`cd ${CFG.vmHelloAi} && git pull -q --ff-only && GATE_COMMIT=warmup000000 ./gate.sh`, { timeout: 600000 });
      return r.code === 0;
    },
  },
  'agent-check': {
    title: 'Agent log-in check',
    live: async (ctx) => {
      const r = await ctx.run(`${CFG.agentLabel}: reply with the single word ok`, CFG.agentBin, ['-p', 'Reply with the single word: ok'], { timeout: 90000 });
      const ok = r.code === 0 && /\bok\b/i.test(r.out);
      ctx.checks({ agent: { ok, text: ok ? `${CFG.agentLabel}: logged in and answering` : `${CFG.agentLabel}: not answering (log in again in your own terminal)` } });
      return ok;
    },
  },

  'ci-branch': {
    title: T('ci-branch'),
    live: async (ctx) => {
      ctx.stage(['mac-me']);
      await ctx.sh(`rm -rf ${ctx.shq(skillDir())}`, { label: `remove any skill installed by an earlier run (hello-ai/.claude/skills/${SKILL_NAME})` });
      const st = await ctx.git(['status', '--porcelain']);
      if (st.out.trim()) { ctx.say('the hello-ai clone has uncommitted changes: use "Clean up" first', 'fail'); return false; }
      await ctx.git(['fetch', '-q', 'origin']);
      const b = `demo-${stamp()}`;
      const sw = await ctx.git(['switch', '-q', '-C', b, 'origin/main']);
      if (sw.code !== 0) return false;
      await ctx.git(['log', '--oneline', '-1']);
      Object.assign(ctx.state, { branch: b, pr: null, unguardedSha: null, lastGate: null, deployed: null });
      ctx.save();
      ctx.result({ status: 'info', title: `On branch ${b}`, lines: ['from origin/main, ready for the agent'] });
      return true;
    },
    replay: [['stage', [['mac-me']]], ['note', 'In the lab the branch was agent-unguarded, made from main at bb04be2.'], ['cmd', 'git fetch -q origin'], ['cmd', 'git switch -q -C agent-unguarded origin/main'], 
      ['result', { status: 'info', title: 'On branch agent-unguarded (recorded)', lines: ['the lab used this branch for pull request #2'] }]],
  },

  'ci-agent-write': {
    title: T('ci-agent-write'),
    live: async (ctx) => {
      if (!ctx.state.branch) { ctx.say('start a clean branch first (step 0)', 'fail'); return false; }
      ctx.stage(['mac-agent']);
      if (ctx.opt.recorded) {
        ctx.say('Using the agent\'s recorded change from the lab (run B), instead of running it live.', 'note');
        await ctx.sh(`cp ${ctx.shq(path.join(agentRuns, 'run-b-no-rules', 'Dockerfile'))} ${ctx.shq(path.join(agentRuns, 'run-b-no-rules', 'requirements.txt'))} ${ctx.shq(CFG.helloAi)}/`, { label: 'cp ci/agent-runs/run-b-no-rules/{Dockerfile,requirements.txt} hello-ai/' });
      } else {
        const w = CFG.agentWorkdir;
        await ctx.sh(`rm -rf ${ctx.shq(w)} && mkdir -p ${ctx.shq(w)} && git -C ${ctx.shq(CFG.helloAi)} archive ${BEFORE_AGENT} app requirements.txt | tar -x -C ${ctx.shq(w)} && ls -A ${ctx.shq(w)}`,
          { label: `prepare the agent's folder: only app/ and requirements.txt, as before the agent's pull request (${BEFORE_AGENT})` });
        const a = await ctx.agent(WRITE_REQUEST, AGENT_TOOLS_WRITE, w);
        if (a.failed) { ctx.say('the agent did not finish: try again, or use the recorded change', 'fail'); return false; }
        await ctx.sh(`cd ${ctx.shq(w)} && for f in Dockerfile .dockerignore requirements.txt; do [ -f "$f" ] && cp "$f" ${ctx.shq(CFG.helloAi)}/ && echo "copied $f"; done; true`, { label: 'copy the agent\'s Dockerfile, .dockerignore and requirements.txt into the branch' });
      }
      await ctx.git(['diff', '--stat']);
      const from = await ctx.sh(`grep -nE '^(FROM|USER|EXPOSE|CMD|ENTRYPOINT)' ${ctx.shq(path.join(CFG.helloAi, 'Dockerfile'))}`, { label: 'grep -nE "^(FROM|USER|EXPOSE|CMD|ENTRYPOINT)" Dockerfile' });
      ctx.result({ status: 'info', title: 'The agent\'s Dockerfile', lines: from.out.trim().split('\n') });
      return true;
    },
    replay: () => [
      ['stage', [['mac-agent']]],
      ['cmd', `${CFG.agentLabel} (headless): ${WRITE_REQUEST}`], ['note', `allowed tools: ${AGENT_TOOLS_WRITE}`],
      ...readRec('run-b-no-rules/agent-output.txt').split('\n').filter(Boolean).map((l) => ['agent', l]),
      ['result', { status: 'info', title: 'The agent\'s Dockerfile (recorded, run B)', lines: keyLinesOf(RUN_B_DOCKERFILE()) }],
    ],
  },

  'ci-open-pr': {
    title: T('ci-open-pr'),
    live: async (ctx) => {
      const b = ctx.state.branch;
      if (!b) { ctx.say('start a clean branch first (step 0)', 'fail'); return false; }
      ctx.stage(['mac-me', 'gh-pr'], ['e-agent-me', 'e-agent-pr']);
      await ctx.git(['add', '-A']);
      const c = await ctx.git(['commit', '-q', '-m', 'Add a Dockerfile and httpx (written by a coding agent with no rules in view)']);
      if (c.code !== 0) { ctx.say('nothing to commit: run step 1 first', 'fail'); return false; }
      const sha = (await ctx.git(['rev-parse', '--short', 'HEAD'], { quiet: true, silentCmd: true })).out.trim();
      const p = await ctx.git(['push', '-q', '-u', 'origin', b], { errAs: 'dim' });
      if (p.code !== 0) return false;
      const pr = await ctx.gh(['pr', 'create', '--repo', R, '--head', b, '--base', 'main', '--title', 'Add a Dockerfile and httpx', '--body', 'A coding agent\'s change, made with no rules in view. Opened from the demo console.']);
      const m = pr.out.match(/\/pull\/(\d+)/);
      if (!m) return false;
      Object.assign(ctx.state, { pr: Number(m[1]), unguardedSha: sha });
      ctx.save();
      ctx.result({ status: 'info', title: `Pull request #${m[1]} opened`, lines: [pr.out.trim(), `commit ${sha}`], link: pr.out.trim() });
      return true;
    },
    replay: [['stage', [['mac-me', 'gh-pr'], ['e-agent-me', 'e-agent-pr']]], ['cmd', 'git add -A'], ['cmd', 'git commit -q -m "Add a Dockerfile and httpx (written by a coding agent with no rules in view)"'],
      ['cmd', 'git push -q -u origin agent-unguarded'], ['cmd', `gh pr create --repo ${R} --head agent-unguarded --base main --title "Add a Dockerfile and httpx"`],
      ['out', `https://github.com/${R}/pull/2`], ['result', { status: 'info', title: 'Pull request #2 opened (recorded)', lines: ['commit ae66f6f'] }]],
  },

  'ci-gate': {
    title: T('ci-gate'), live: gateStep,
    replay: [['stage', [['gh-check', 'vm-runner'], ['e-pr-runner']]], ['note', 'waiting for GitHub to start the "gate" workflow for ae66f6f …'], ['sleep', 900],
      ['stage', [['vm-runner', 'vm-gate'], ['e-runner-gate']]], ...gateReplay(L_UNGUARDED, 'ae66f6f', 43906208662),
      ['stage', [['vm-gate', 'gh-check'], ['e-gate-check']]], ['result', { status: 'fail', title: 'GATE FAIL for ae66f6f (recorded)', rows: rowsOf(L_UNGUARDED), lines: ['scan: two fixable High CVEs in Debian\'s zlib1g'] }]],
  },

  'ci-skill-gate': {
    title: T('ci-skill-gate'),
    live: async (ctx) => {
      ctx.stage(['mac-agent', 'vm-skillspector'], ['e-skills-scan']);
      ctx.say('The agent needs a skill to fix the Dockerfile. Each candidate is scanned on the build VM before the agent may load it.', 'note');
      const rows = []; let allowed = null, blocked = 0;
      for (const s of SKILLS) {
        ctx.say(`candidate: ${s.name}, from ${s.from}`, 'note');
        const r = await ctx.vm(`cd ${CFG.vmLab} && SKILL_GATE_OUT=/tmp/skill-gate bash ci/skills/skill-gate.sh ${s.path}`, { label: `bash ci/skills/skill-gate.sh ${s.path}`, filter: (l) => (/^BLOCKED/.test(l) ? ['fail', l] : /^ALLOWED/.test(l) ? ['ok', l] : l) });
        const head = r.out.split('\n').find((l) => /^(ALLOWED|BLOCKED)/.test(l));
        if (r.code === 2 || !head) { ctx.say(`the scan of ${s.name} did not complete`, 'fail'); return false; }
        rows.push([r.code === 0 ? 'ALLOWED' : 'BLOCKED', s.name, head.replace(/^(ALLOWED|BLOCKED)\s+\S+\s+/, '').replace(/, scan complete: \w+$/, '')]);
        if (r.code === 0 && s.name === SKILL_NAME) allowed = { ...s, hash: (r.out.match(/content sha256 ([0-9a-f]{16})/) || [])[1] };
        if (r.code !== 0) blocked++;
      }
      let installed = false;
      if (allowed) {
        ctx.stage(['vm-skillspector', 'mac-skill'], ['e-skill-install']);
        const dest = path.dirname(skillDir()); const ex = path.join(CFG.helloAi, '.git', 'info', 'exclude');
        await ctx.sh(`mkdir -p ${ctx.shq(dest)} && rm -rf ${ctx.shq(skillDir())} && { grep -qxF '.claude/' ${ctx.shq(ex)} || echo '.claude/' >> ${ctx.shq(ex)}; } && ` +
          `multipass exec ${CFG.vm} -- tar -C ${CFG.vmLab}/${path.dirname(allowed.path)} -cf - ${SKILL_NAME} | tar -x -C ${ctx.shq(dest)} && ls ${ctx.shq(skillDir())}`,
        { label: `copy the scanned ${SKILL_NAME} from the build VM into hello-ai/.claude/skills/ (Git ignores .claude/)` });
        const h = await ctx.sh(`cd ${ctx.shq(skillDir())} && find . -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -c1-16`, { label: 'content sha256 of the installed copy', quiet: true });
        installed = !!allowed.hash && h.out.trim() === allowed.hash;
        ctx.say(installed ? `installed: content sha256 ${allowed.hash}, the same bytes the gate scanned` : `content hash mismatch: scanned ${allowed.hash}, installed ${h.out.trim()}`, installed ? 'ok' : 'fail');
        rows[rows.findIndex((x) => x[1] === SKILL_NAME)][2] += installed ? ', installed for the agent' : ', NOT installed';
      }
      const ok = blocked === 1 && installed;
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'Skill gate: one blocked, one allowed and installed' : 'Skill gate: unexpected result', rows });
      return ok;
    },
    replay: () => {
      const sc = [['stage', [['mac-agent', 'vm-skillspector'], ['e-skills-scan']]], ['note', 'The agent needs a skill to fix the Dockerfile. Each candidate is scanned on the build VM before the agent may load it.']];
      const rows = [];
      for (const s of SKILLS) {
        const rec = skillRecord(s.name); const head = rec[0] || '';
        sc.push(['note', `candidate: ${s.name}, from ${s.from}`], ['cmd', `bash ci/skills/skill-gate.sh ${s.path}`], ...rec.map((l) => [/^BLOCKED/.test(l) ? 'fail' : /^ALLOWED/.test(l) ? 'ok' : 'out', l]));
        rows.push([/^ALLOWED/.test(head) ? 'ALLOWED' : 'BLOCKED', s.name, head.replace(/^(ALLOWED|BLOCKED)\s+\S+\s+/, '').replace(/, scan complete: \w+$/, '')]);
      }
      sc.push(['stage', [['vm-skillspector', 'mac-skill'], ['e-skill-install']]], ['note', `In the lab the allowed skill was then copied into hello-ai/.claude/skills/ (ignored by Git) and its content hash checked; replay does not change the clone.`]);
      sc.push(['result', { status: 'pass', title: 'Skill gate: one blocked, one allowed (recorded, step 24)', rows }]);
      return sc;
    },
  },

  'ci-agent-fix': {
    title: T('ci-agent-fix'),
    live: async (ctx) => {
      if (!ctx.state.pr) { ctx.say('open the pull request first (step 2)', 'fail'); return false; }
      const withSkill = skillInstalled();
      ctx.stage(withSkill ? ['mac-agent', 'gh-check', 'mac-skill'] : ['mac-agent', 'gh-check'], withSkill ? ['e-check-agent', 'e-skill-agent'] : ['e-check-agent']);
      if (!withSkill && !ctx.opt.recorded) ctx.say('No skill installed (step 4 not run): the agent gets the full instructions in its prompt, as in the lab.', 'note');
      if (ctx.opt.recorded) {
        ctx.say(`Using the agent's reviewed fix from the lab (commit ${AGENT_FIXED}), instead of running it live.`, 'note');
        await ctx.sh(`cd ${ctx.shq(CFG.helloAi)} && git show ${AGENT_FIXED}:Dockerfile > Dockerfile && git show ${AGENT_FIXED}:.dockerignore > .dockerignore`, { label: `git show ${AGENT_FIXED}:Dockerfile > Dockerfile` });
      } else {
        const a = await ctx.agent(withSkill ? fixPromptSkill(ctx.state.pr) : fixPrompt(ctx.state.pr), withSkill ? `${AGENT_TOOLS_FIX},Skill` : AGENT_TOOLS_FIX, CFG.helloAi);
        if (a.failed) { ctx.say('the agent did not finish: try again, or use the recorded fix', 'fail'); return false; }
      }
      await ctx.git(['diff', '--stat']);
      const d = await ctx.git(['diff', '-U0', '--', 'Dockerfile'], { filter: (l) => (/^[+-](FROM|USER|EXPOSE|CMD|ENTRYPOINT|RUN)/.test(l) ? l : null) });
      ctx.result({ status: 'info', title: 'The agent\'s fix (Dockerfile lines that changed)', lines: d.out.split('\n').filter((l) => /^[+-](FROM|USER|EXPOSE|CMD|ENTRYPOINT|RUN)/.test(l)) });
      return true;
    },
    replay: () => [
      ['stage', [['mac-agent', 'gh-check'], ['e-check-agent']]],
      ['note', 'Recorded in the lab (step 21), before the skill gate existed: the agent had these instructions in its prompt, which the vetted skill now carries. With the skill, a rehearsal passed the gate on the first run (ci/agent-runs/skill-run/).'],
      ['note', 'Recorded: in the lab this took two agent runs, the fix from the gate\'s log, then a review round.'],
      ['cmd', `${CFG.agentLabel} (headless): ${readRec('fix-instruction.txt').slice(0, 150)}…`],
      ...readRec('fix-run-2-output.txt').split('\n').filter(Boolean).map((l) => ['agent', l]),
      ['fail', 'GATE FAIL for 7c0e39f: FAIL build, and the gate hid the reason (docker build output goes to /dev/null)'],
      ['note', 'Reproduced on the VM: "addgroup: permission denied (are you root?)": Chainguard images run RUN steps as 65532'],
      ['cmd', `${CFG.agentLabel} (headless): ${readRec('review-instruction.txt').slice(0, 150)}…`],
      ...readRec('review-run-output.txt').split('\n').filter(Boolean).map((l) => ['agent', l]),
      ['result', { status: 'info', title: 'The agent\'s fix against its first Dockerfile (recorded, as merged)', lines: dockerDiff(RUN_B_DOCKERFILE(), FIXED_DOCKERFILE()) }],
    ],
  },

  'ci-push-fix': {
    title: T('ci-push-fix'),
    live: async (ctx) => {
      if (!ctx.state.pr) { ctx.say('open the pull request first (step 2)', 'fail'); return false; }
      ctx.stage(['mac-me', 'gh-pr'], ['e-agent-me', 'e-agent-pr']);
      await ctx.git(['diff', '--stat']);
      await ctx.git(['add', '-A']);
      const c = await ctx.git(['commit', '-q', '-m', 'Use Chainguard images pinned by digest (the agent\'s fix from the gate\'s log)']);
      if (c.code !== 0) { ctx.say('nothing to commit: run step 4 first', 'fail'); return false; }
      const sha = (await ctx.git(['rev-parse', '--short', 'HEAD'], { quiet: true, silentCmd: true })).out.trim();
      const p = await ctx.git(['push', '-q'], { errAs: 'dim' });
      ctx.result({ status: p.code === 0 ? 'info' : 'fail', title: `Pushed ${sha} to pull request #${ctx.state.pr}`, lines: ['the gate starts again on the new commit'] });
      return p.code === 0;
    },
    replay: [['stage', [['mac-me', 'gh-pr'], ['e-agent-me', 'e-agent-pr']]], ['cmd', 'git add -A'],
      ['cmd', 'git commit -q -m "Minimal runtime image, venv under /app, start uvicorn on 8080 (the agent\'s fix after review)"'], ['cmd', 'git push -q'],
      ['result', { status: 'info', title: 'Pushed 57a4ec4 to pull request #2 (recorded)', lines: ['the gate starts again on the new commit'] }]],
  },

  'ci-gate-2': {
    title: T('ci-gate-2'), live: gateStep,
    replay: [['stage', [['gh-check', 'vm-runner'], ['e-pr-runner']]], ['note', 'waiting for GitHub to start the "gate" workflow for 57a4ec4 …'], ['sleep', 900],
      ['stage', [['vm-runner', 'vm-gate'], ['e-runner-gate']]], ...gateReplay(L_PASS('57a4ec4'), '57a4ec4', 43907723782),
      ['stage', [['vm-gate', 'gh-check'], ['e-gate-check']]], ['result', { status: 'pass', title: 'GATE PASS for 57a4ec4 (recorded)', rows: rowsOf(L_PASS('57a4ec4')) }]],
  },

  'ci-merge': {
    title: T('ci-merge'),
    live: async (ctx) => {
      if (!ctx.state.pr) { ctx.say('open the pull request first (step 2)', 'fail'); return false; }
      ctx.stage(['mac-me', 'gh-rule'], ['e-me-rule']);
      const m = await ctx.gh(['pr', 'merge', String(ctx.state.pr), '--repo', R, '--merge']);
      if (m.code !== 0) return false;
      let oid = '';
      for (let i = 0; i < 10 && !oid; i++) { const s = await prState(ctx); oid = (s && s.mergeCommit && s.mergeCommit.oid) || ''; if (!oid) await ctx.sleep(2000); }
      if (!oid) { ctx.say('merged, but GitHub has not reported the merge commit yet', 'fail'); return false; }
      ctx.say(`merge commit ${oid.slice(0, 7)}`, 'ok');
      ctx.stage(['gh-rule', 'vm-runner', 'vm-gate', 'vm-deploy'], ['e-rule-deploy']);
      const run = await findRun(ctx, 'deploy.yml', 'main', oid);
      if (!run) return false;
      const v = await watchRun(ctx, run.databaseId);
      if (!v) return false;
      ctx.stage(['vm-deploy', 'vm-registry', 'k8s-policy', 'k8s-pods'], ['e-deploy-registry', 'e-deploy-admit', 'e-policy-pods', 'e-registry-pods']);
      const lines = await keyLines(ctx, run.databaseId);
      const dep = (lines.find((l) => /^DEPLOYED /.test(l)) || '').replace('DEPLOYED ', '');
      ctx.state.deployed = dep; ctx.save();
      ctx.result({ status: v.conclusion === 'success' ? 'pass' : 'fail', title: v.conclusion === 'success' ? 'Merged, signed and deployed' : `deploy run ${v.conclusion}`, rows: rowsOf(lines), lines: lines.filter((l) => /^(SIGNED|DEPLOYED)|rolled out/.test(l)) });
      return v.conclusion === 'success';
    },
    replay: [['stage', [['mac-me', 'gh-rule'], ['e-me-rule']]], ['cmd', `gh pr merge 2 --repo ${R} --merge`], ['ok', 'merge commit 718b24a'],
      ['stage', [['gh-rule', 'vm-runner', 'vm-gate', 'vm-deploy'], ['e-rule-deploy']]], ['note', 'waiting for GitHub to start the "deploy" workflow for 718b24a …'], ['sleep', 900],
      ['cmd', `gh run watch 43908366650 --repo ${R}`], ['ok', 'run 43908366650: success'],
      ['stage', [['vm-deploy', 'vm-registry', 'k8s-policy', 'k8s-pods'], ['e-deploy-registry', 'e-deploy-admit', 'e-policy-pods', 'e-registry-pods']]],
      ['cmd', `gh run view 43908366650 --repo ${R} --log   (the gate's lines)`], ...L_PASS('718b24a').map((l) => ['ok', l]),
      ['ok', 'SIGNED localhost:5000/hello-ai@sha256:ba805fe2456ed5caedbdffc8efdc1ab6a5cdbb3928b8e6d3bb266c057a6adf4b'], ['ok', 'deployment "hello-ai" successfully rolled out'],
      ['ok', 'DEPLOYED 192.168.252.2:5000/hello-ai@sha256:ba805fe2456ed5caedbdffc8efdc1ab6a5cdbb3928b8e6d3bb266c057a6adf4b'],
      ['result', { status: 'pass', title: 'Merged, signed and deployed (recorded)', rows: rowsOf(L_PASS('718b24a')), lines: ['SIGNED localhost:5000/hello-ai@sha256:ba805fe2…', 'DEPLOYED 192.168.252.2:5000/hello-ai@sha256:ba805fe2…'] }]],
  },

  'ci-cluster': {
    title: T('ci-cluster'),
    live: async (ctx) => {
      ctx.stage(['k8s-policy', 'k8s-pods'], ['e-policy-pods']);
      const r = await ctx.vm('kubectl get pods -l app=hello-ai -o custom-columns=POD:.metadata.name,READY:.status.containerStatuses[0].ready,IMAGE:.status.containerStatuses[0].imageID; ' +
        'D=$(kubectl get deploy hello-ai -o jsonpath="{.spec.template.spec.containers[0].image}" | cut -d@ -f2); echo "deployed digest: $D"; ' +
        'cosign verify --key ~/cosign-lab/cosign.pub --insecure-ignore-tlog=true localhost:5000/hello-ai@$D >/dev/null 2>&1 && echo "cosign verify: Verified OK with the lab key" || echo "cosign verify: FAILED"; ' +
        'kubectl get imagevalidatingpolicies require-lab-signature', { label: 'kubectl get pods -l app=hello-ai; cosign verify --key cosign.pub <deployed digest>; kubectl get imagevalidatingpolicies' });
      const dig = (r.out.match(/deployed digest: (\S+)/) || [])[1] || '';
      const ok = /Verified OK/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'Running the signed digest' : 'signature check failed', lines: [`digest ${dig}`, ok ? 'cosign verify: Verified OK with the lab key' : 'cosign verify failed'] });
      return ok;
    },
  },

  'ci-unsigned': {
    title: T('ci-unsigned'),
    live: async (ctx) => {
      ctx.stage(['k8s-policy', 'k8s-refused'], ['e-policy-refused']);
      const img = `${CFG.registry}/hello-ai@${CFG.unsignedDigest}`;
      const r = await ctx.vm('kubectl get ns bypass-test >/dev/null 2>&1 || kubectl create ns bypass-test >/dev/null; ' +
        `kubectl run bypass-$(date +%H%M%S) -n bypass-test --restart=Never --image=${img} 2>&1; ` +
        'echo "pods in bypass-test: $(kubectl get pods -n bypass-test --no-headers 2>/dev/null | wc -l)"',
      { label: `kubectl run bypass -n bypass-test --image=${CFG.registry}/hello-ai@${CFG.unsignedDigest.slice(0, 19)}…` });
      const refused = /denied the request/.test(r.out);
      const msg = (r.out.match(/The image must be signed[^\n]*/) || [''])[0];
      ctx.result({ status: refused ? 'pass' : 'fail', title: refused ? 'Refused by the admission policy' : 'NOT refused: check the policy', lines: [msg || r.out.trim().split('\n')[0], (r.out.match(/pods in bypass-test: \d+/) || [''])[0]] });
      return refused;
    },
  },

  'ci-call': {
    title: T('ci-call'),
    live: async (ctx) => {
      ctx.stage(['k8s-pods']);
      // Stop the port-forward by its process ID: a pkill -f on its command line also matched this shell's own
      // command line, so the shell killed itself and multipass reported "Process terminated by signal: TERM".
      const r = await ctx.vm('kubectl port-forward svc/hello-ai 8086:8080 >/tmp/console-pf.log 2>&1 & pf=$!; sleep 3; ' +
        'echo "GET  /    -> $(curl -s localhost:8086/)"; ' +
        'echo "POST /ask -> $(curl -s -X POST localhost:8086/ask -H "content-type: application/json" -d "{\\"text\\":\\"is this image signed?\\"}")"; ' +
        '{ kill $pf; wait $pf; } 2>/dev/null; true', { label: 'kubectl port-forward svc/hello-ai 8086:8080; curl localhost:8086/; curl -X POST localhost:8086/ask' });
      const ok = /Hello AI!/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'The app answers from the cluster' : 'no answer', lines: r.out.trim().split('\n').filter((l) => /->/.test(l)) });
      return ok;
    },
  },

  'ci-chainguard': {
    title: T('ci-chainguard'),
    live: async (ctx) => { cgView(ctx); return true; },
    replay: () => cgViewScript(),
  },

  'ci-hook': {
    title: EXTRAS[0].title,
    live: async (ctx) => {
      ctx.stage(['vm-gate']);
      const commit = ctx.state.unguardedSha || 'ae66f6f';
      ctx.say(`Pushing ${commit} (the agent's unguarded commit) to the bare repository on the VM; its pre-receive hook runs gate.sh.`, 'note');
      const r = await ctx.vm(`cd ${CFG.vmHelloAi} && git fetch -q origin && git push local ${commit}:refs/heads/hook-$(date +%H%M%S) 2>&1 | sed -e "s/^remote: //" -e "s/ *$//"`, { label: `git push local ${commit}:refs/heads/hook-<time>   (on the VM)`, timeout: 600000, quiet: true });
      for (const l of r.out.split('\n').filter((x) => x.trim())) ctx.say(l, /^(FAIL|GATE FAIL)|refused|rejected|^error/.test(l.trim()) ? 'fail' : /^(PASS|GATE PASS)/.test(l.trim()) ? 'ok' : 'out');
      const refused = /pre-receive hook declined|push refused/.test(r.out);
      const lines = r.out.split('\n').filter((l) => /^(PASS|FAIL)  /.test(l.trim())).map((l) => l.trim());
      ctx.result({ status: refused ? 'pass' : 'info', title: refused ? 'Push refused by the hook: the same gate, no GitHub' : 'Push accepted', rows: rowsOf(lines) });
      return true;
    },
    replay: [['stage', [['vm-gate']]], ['cmd', 'git push local ae66f6f:refs/heads/unguarded   (on the VM)'],
      ...['== gate for refs/heads/unguarded at ae66f6f', ...L_UNGUARDED, '== push refused: the gate failed', ' ! [remote rejected] ae66f6f -> unguarded (pre-receive hook declined)'].map((l) => [/^FAIL|refused|rejected|GATE FAIL/.test(l) ? 'fail' : /^PASS/.test(l) ? 'ok' : 'out', l]),
      ['result', { status: 'pass', title: 'Push refused by the hook (recorded)', rows: rowsOf(L_UNGUARDED) }]],
  },

  'ci-cleanup': {
    title: 'Clean up',
    live: async (ctx) => {
      const s = await prState(ctx);
      if (s && s.state === 'OPEN') await ctx.gh(['pr', 'close', String(ctx.state.pr), '--repo', R, '--delete-branch']);
      else if (ctx.state.branch) await ctx.git(['push', '-q', 'origin', '--delete', ctx.state.branch], { label: `git push origin --delete ${ctx.state.branch}` });
      await ctx.git(['checkout', '-q', '--', '.']);
      await ctx.git(['clean', '-fdq']);
      await ctx.sh(`rm -rf ${ctx.shq(skillDir())}`, { label: `rm -rf hello-ai/.claude/skills/${SKILL_NAME}` });
      await ctx.git(['switch', '-q', 'main']);
      await ctx.git(['pull', '-q', '--ff-only']);
      await ctx.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/demo-*'], { quiet: true }).then(async (r) => {
        for (const b of r.out.split('\n').filter(Boolean)) await ctx.git(['branch', '-D', b]);
      });
      await ctx.vm('kubectl delete pods -n bypass-test --all --ignore-not-found 2>&1 | tail -1', { label: 'kubectl delete pods -n bypass-test --all' });
      Object.assign(ctx.state, { branch: null, pr: null, unguardedSha: null, lastGate: null });
      ctx.save();
      ctx.result({ status: 'info', title: 'Clean: the Mac clone is back on main', lines: [] });
      return true;
    },
  },
};

module.exports = {
  name: 'ci',
  actions,
  meta: { steps: STEPS, extras: EXTRAS, checks: CHECKS, repo: R, agentLabel: CFG.agentLabel, chainguard: require('./chainguard') },
};
