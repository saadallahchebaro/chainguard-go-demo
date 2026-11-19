// demo/console/actions/chainguard.js: where Chainguard's products meet this pipeline, one place for both pages.
// Statuses as published on chainguard.dev and its docs, checked on 17 November 2026; check them again before the panel.
// "Technology Preview" is the wording of Chainguard's own terms for some beta and early-access products.
'use strict';

const CHECKED = '17 November 2026';
const SRC = 'https://www.chainguard.dev';

// id: [product, status, what it does, where it meets this lab, source path]
const PRODUCTS = {
  containers: ['Chainguard Containers', 'generally available', 'Minimal images rebuilt from source, standard tags with no shell or package manager, signed, each with an SBOM and SLSA provenance.', 'Images C, D and E, and hello-ai\'s builder and runtime; gate checks 1 and 2.', '/docs/chainguard/containers/concepts/container-variants'],
  libraries: ['Chainguard Libraries', 'generally available for Python, Java and JavaScript; Go and .NET in beta', 'Packages rebuilt from source, as drop-in replacements for PyPI, Maven Central and npm.', 'hello-ai\'s packages come from PyPI, held only by exact pins and a 7-day cooldown (gate checks 3 and 4).', '/unchained/everything-we-announced-during-ai-readiness-innovation-week'],
  repository: ['Chainguard Repository', 'beta', 'One policy-managed endpoint for Chainguard artifacts.', 'The lab pulls from cgr.dev and PyPI separately; its policies are a script.', '/unchained/introducing-chainguard-repository'],
  factory: ['Chainguard Factory 2.0', 'announced January 2026', 'Chainguard\'s own build system: reconciler bots compare each image with an up-to-date, no-known-CVE target and fix the drift.', 'Why C, D and E had almost nothing to find, and why the digests move every day.', '/unchained/driftlessaf-introducing-chainguard-factory-2-0'],
  eol: ['EOL grace period', 'generally available', 'Up to 6 months of rebuilds after a version reaches upstream end of life.', 'Image A ran Debian 11 and Go 1.18, both past their end of life.', '/docs/chainguard/containers/concepts/lifecycle-and-eol/eol-grace-period'],
  fips: ['FIPS images', 'generally available', 'Variants with a FIPS 140-3 validated OpenSSL provider.', 'Not used in the lab; the question for regulated customers.', '/docs/chainguard/changelog'],
  ai: ['AI images', 'available', 'PyTorch with CUDA, NeMo, KServe model servers and vllm-omni, for AI workloads on Kubernetes.', 'The same supply chain for the images under an AI factory.', '/docs/chainguard/containers/getting-started/ai-and-data/pytorch'],
  actions: ['Chainguard Actions', 'generally available (October 2026)', 'Hardened drop-in GitHub Actions, with their transitive dependencies pinned.', 'gate.yml and deploy.yml use actions/checkout, pinned by commit by hand.', '/docs/chainguard/changelog'],
  checks: ['Chainguard Checks', 'beta, a Technology Preview', 'CI checks in hardened microVMs; each run produces a signed attestation tied to the commit.', 'gate.sh runs on a self-hosted runner and its verdict is an unsigned JSON file.', '/products/checks'],
  guardener: ['Guardener', 'early access, a Technology Preview', 'An AI migration agent and GitHub App: moves images and workflows onto hardened ones and verifies commits.', 'The agent\'s fix did this migration with dfc and crane, by hand.', '/docs/chainguard/guardener/overview'],
  skills: ['Chainguard Agent Skills', 'beta, a Technology Preview', 'A catalog of third-party agent skills, reviewed against a security ruleset, fixed rather than only flagged, signed, with a HARDENING.md audit trail.', 'The vetted chainguard-dockerfile skill plays this role; SkillSpector gates it again where it is used.', '/docs/chainguard/agent-skills/public-registry'],
  workspaces: ['Chainguard Workspaces', 'beta, a Technology Preview', 'MicroVM sessions for developers and coding agents: credentials stay outside the VM, outbound traffic is denied by default.', 'The agent runs on the Mac, held by a tool allowlist and project-only settings.', '/products/workspaces'],
  mcp: ['Chainguard MCP servers', 'generally available (October 2026)', 'Let agents check images, SBOMs, provenance, end-of-life dates and policy.', 'The agent asked crane and dfc on the build VM instead.', '/unchained/everything-we-announced-at-chainguard-assemble-london-2026'],
  signing: ['Signatures and attestations', 'on every image', 'Sigstore keyless signatures, with SLSA v1 provenance and an SPDX SBOM attached to each image.', 'Verified with cosign in gate check 2 and at step 22b; the lab signs its own images with a key.', '/docs/chainguard/changelog'],
  harness: ['Chainguard Harness', 'beta, by waitlist', 'An AI model tests a live copy of your application for exploitable bugs, with fixes reviewed by engineers.', 'The demo only calls the app (step 11).', '/unchained/introducing-chainguard-harness'],
};

// The supply chain, stage by stage, for the presentation page
const STAGES = [
  ['Dependencies', ['libraries', 'repository']],
  ['Base images', ['containers', 'factory', 'eol', 'fips', 'ai']],
  ['CI pipeline', ['actions', 'checks', 'guardener']],
  ['Coding agents and skills', ['skills', 'workspaces', 'mcp']],
  ['Signing, SBOM, provenance', ['signing']],
  ['Running application', ['harness']],
];
const NOT_CHAINGUARD = 'Admission control is not a Chainguard product: its docs show Kyverno and OPA Gatekeeper policies that verify its signatures, as this lab does with Kyverno.';

// On the CI diagram: which product meets which node (at most two per node)
const PILLS = {
  'up-cg': ['containers'], 'up-pypi': ['libraries'], 'up-skills': ['skills'],
  'mac-agent': ['workspaces', 'mcp'], 'gh-pr': ['guardener'], 'vm-runner': ['actions'], 'vm-gate': ['checks'],
  'k8s-pods': ['harness'],
};
const SHORT = { containers: 'Containers', libraries: 'Libraries', repository: 'Repository', factory: 'Factory 2.0', eol: 'EOL grace', fips: 'FIPS', ai: 'AI images', actions: 'Actions', checks: 'Checks', guardener: 'Guardener', skills: 'Agent Skills', workspaces: 'Workspaces', mcp: 'MCP', signing: 'Signed + attested', harness: 'Harness' };
// the status as a table cell: short, with the full wording kept for the tooltip and the pills' detail
const STATUS_CELL = { libraries: 'GA: Python, Java, JavaScript · beta: Go, .NET', actions: 'GA, October 2026', mcp: 'GA, October 2026', checks: 'beta · Technology Preview', workspaces: 'beta · Technology Preview', skills: 'beta · Technology Preview', guardener: 'early access · Technology Preview', factory: 'announced, January 2026', harness: 'beta, by waitlist', repository: 'beta', signing: 'on every image', ai: 'available', containers: 'GA', eol: 'GA', fips: 'GA' };
const SHORT_STATUS = (st) => (/^generally available/.test(st) ? 'GA' : /^beta, by waitlist/.test(st) ? 'beta waitlist' : /^beta/.test(st) ? 'beta' : /^early access/.test(st) ? 'early access' : /^announced/.test(st) ? 'announced' : st);

// Step 12, the Chainguard view: what each product does to this pipeline. verb: replaces, adds, in use, works with,
// or stays yours (no Chainguard product there). onDiagram: whether it gets a tag on the diagram (at most two per node).
// [where (node id), product id or null, verb, what it changes here, onDiagram]
const VIEW = [
  ['up-cg', 'containers', 'in use', 'The lab already builds on them; a subscription adds versioned tags, FIPS and the EOL grace period', true],
  ['up-cg', 'factory', 'behind it', 'Keeps every image at an up-to-date, no-known-CVE target', false],
  ['up-cg', 'eol', 'adds', 'Rebuilds for up to 6 months after a version reaches upstream end of life', false],
  ['up-cg', 'fips', 'adds', 'FIPS 140-3 variants of the same images', false],
  ['up-cg', 'ai', 'adds', 'The images under AI workloads: PyTorch with CUDA, NeMo, KServe, vllm-omni', false],
  ['up-pypi', 'libraries', 'replaces', 'PyPI as the source of hello-ai\'s packages, with packages rebuilt from source', true],
  ['up-pypi', 'repository', 'adds', 'One policy-managed endpoint for Chainguard artifacts', false],
  ['up-skills', 'skills', 'replaces', 'The unvetted skill registry: skills reviewed, fixed and signed before they are published', true],
  ['mac-agent', 'workspaces', 'replaces', 'The agent\'s local run on the Mac: a microVM, credentials outside it, outbound traffic denied by default', true],
  ['mac-agent', 'mcp', 'adds', 'Image, SBOM, provenance and end-of-life checks the agent can call itself', true],
  ['gh-pr', 'guardener', 'adds', 'Migration pull requests to hardened images and actions, and commit verification', true],
  ['vm-runner', 'actions', 'replaces', 'actions/checkout and the other actions in the workflows, with hardened ones', true],
  ['vm-gate', 'checks', 'adds', 'Each check in a hardened microVM, with a signed verdict for each commit', true],
  ['vm-skillspector', 'skills', 'works with', 'Chainguard scans before publishing; this gate still scans where the skill is used', true],
  ['k8s-pods', 'harness', 'adds', 'Exploit testing against a live copy of the running app', true],
  ['vm-deploy', null, 'stays yours', 'Signing your own image (Custom Assembly images come signed under your organisation\'s identity)', true],
  ['vm-registry', null, 'stays yours', 'Your registry for your own images', true],
  ['k8s-policy', null, 'stays yours', 'Admission: Kyverno or OPA Gatekeeper; Chainguard\'s docs show the policies that verify its signatures', true],
];
const product = (id) => { const [name, status, what, lab, src] = PRODUCTS[id]; return { id, name, status, what, lab, url: SRC + src, short: SHORT[id], shortStatus: SHORT_STATUS(status), cell: STATUS_CELL[id] || status }; };
module.exports = {
  CHECKED, NOT_CHAINGUARD,
  pills: Object.fromEntries(Object.entries(PILLS).map(([node, ids]) => [node, ids.map(product)])),
  stages: STAGES.map(([stage, ids]) => ({ stage, products: ids.map(product) })),
  view: VIEW.map(([where, id, verb, change, onDiagram]) => ({ where, verb, change, onDiagram, product: id ? product(id) : null })),
};
