// demo/console/actions/present.js: the full presentation, one section per part of the deck. Every action is a
// read-only proof that runs live in seconds (it never builds or changes anything); in replay mode each shows the
// lab's own screenshot of the same check instead, except the Dockerfiles and image A's two-scanner table, which have none and are only read, so run live. The exceptions are the two kubectl debug actions on the k3s
// section: each adds a debug container to one pod of image E, then deletes that pod so the deployment replaces it.
'use strict';
const CFG = require('../config');
const { GROUPS } = require('./shortcuts');
const CG = require('./chainguard');
const L = CFG.vmLab;
const STATIC = 'cgr.dev/chainguard/static@sha256:fc42af33e643f20d08baf03cddcc1c02ba57052dfb02edb0d79f3fc47bcea8d9';
const CG_ID = '--certificate-oidc-issuer=https://token.actions.githubusercontent.com --certificate-identity=https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main';

const SECTIONS = [
  { id: 'ask', title: 'Show me: quick answers', slides: 'any', claim: 'One click per likely question, live on the build VM. The live groups use throwaway hello-live images.', shortcuts: GROUPS.map((g) => ({ group: g.group, items: g.items.filter(([, , , o = {}]) => !o.deckOnly).map(([id, title]) => ({ id, title })) })) },
  { id: 'lab', title: 'The lab', slides: '7–9', claim: 'Two Ubuntu VMs on the Mac, Docker Engine and every tool installed from its official source and checked.', actions: ['p-lab'] },
  { id: 'app', title: 'The app ships as one static file', slides: '11', claim: 'The binary records its Go version and every module it was built with; that is what the scanners read.', actions: ['p-app'] },
  { id: 'images', title: 'Images A to E', slides: '12–18', claim: 'Each image changes one decision: single-stage, multi-stage, the Chainguard runtime base, the dependencies, then the app\'s own code and settings.', actions: ['p-images', 'p-scanners-a', 'p-shell', 'p-debug-d','p-diff-bc', 'p-static-verify', 'p-image-d', 'p-de'] },
  { id: 'dockerfiles', title: 'The Dockerfiles, A to E', slides: '60–64', claim: 'Each image\'s Dockerfile as it is in the repo, with its line numbers; ">" marks the instructions that changed from the image before.', actions: ['p-df-a', 'p-df-b', 'p-df-c', 'p-df-d', 'p-df-e'] },
  { id: 'results', title: 'Results: every layer, every image', slides: '16, 19', claim: 'Against the same databases: 734, 161, 69, 0 and 0 unique CVEs. D and E are both clean in Grype, Trivy and govulncheck; only E fixes the app.', actions: ['p-results', 'p-rescan-d'] },
  { id: 'triage', title: 'One CVE, followed all the way', slides: '20, 46', claim: 'HTTP/2 Rapid Reset: where it lives in the binary, how it is rated, whether my code reaches it.', actions: ['p-triage'] },
  { id: 'supply', title: 'Prove what is inside and who built it', slides: '21', claim: 'An SBOM per image, E signed by digest (C and D fail verification), and Chainguard\'s own provenance verified.', actions: ['p-sbom', 'p-sign', 'p-provenance'] },
  { id: 'k8s', title: 'k3s pulls the digest I signed', slides: '22, 52', claim: 'Two pods under the restricted Pod Security level, exactly as the manifests say; an unsigned image is refused at admission, but not as a debug container.', actions: ['p-k8s', 'p-manifests', 'p-kyverno-c', 'p-debug-k8s', 'p-debug-gap'] },
  { id: 'wrong', title: 'What went wrong, and what I learned', slides: '26', claim: 'Two scanners, two counts; no base image reaches a Go binary; a signature protects nothing until something checks it.', actions: ['p-wrong'] },
  { id: 'cg', title: 'Where Chainguard helps', slides: 'all', claim: `Each stage of this supply chain, the Chainguard product that meets it and its status on ${CG.CHECKED}, and where it touches the lab.`, chainguard: CG },
  { id: 'agent', title: 'An agent in the pipeline', slides: '30, 38', claim: 'The live CI demo has its own page: every step of the pipeline, triggered and explained.', link: '/ci' },
];

const A = {
  'p-lab': {
    title: 'The VMs and the tool versions', shots: ['03-tools-versions.png', '05-versions.png'],
    live: async (ctx) => {
      await ctx.run('multipass list', 'multipass', ['list']);
      const r = await ctx.vm('docker version --format "Docker Engine {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})"; go version; ' +
        'grype version 2>/dev/null | grep -m1 "^Version"; trivy --version 2>/dev/null | head -1; syft version 2>/dev/null | grep -m1 "^Version"; ' +
        'cosign version 2>&1 | grep -m1 GitVersion; echo "crane $(crane version)"; kubectl version --client 2>/dev/null | head -1',
      { label: 'docker version; go version; grype version; trivy --version; syft version; cosign version; crane version; kubectl version --client' });
      ctx.result({ status: 'info', title: 'Lab versions (live)', lines: r.out.trim().split('\n') });
      return r.code === 0;
    },
  },
  'p-app': {
    title: 'go version -m on the shipped binary', shots: ['06-app-buildinfo.png'],
    live: async (ctx) => {
      const r = await ctx.vm('docker create --name console-tmp-b hello:b >/dev/null && docker cp -q console-tmp-b:/usr/local/bin/hello-server /tmp/console-hs-b && docker rm console-tmp-b >/dev/null; ' +
        'go version -m /tmp/console-hs-b | grep -E "go1\\.|\\sdep\\s|\\sbuild\\s+(CGO_ENABLED|GOARCH|GOOS)"; ' +
        'echo "modules compiled in: $(go version -m /tmp/console-hs-b | grep -cP "^\\s+dep\\s")   size: $(stat -c %s /tmp/console-hs-b) bytes"',
      { label: 'docker cp hello:b:/usr/local/bin/hello-server, then go version -m' });
      const last = r.out.trim().split('\n').pop();
      ctx.result({ status: 'info', title: 'The binary in images A, B and C', lines: [r.out.split('\n')[0], last] });
      return r.code === 0;
    },
  },
  'p-images': {
    title: 'Sizes and users of A to E', shots: ['37-images-a-to-e.png', '37-results-five-images.png'],
    live: async (ctx) => {
      const r = await ctx.vm('docker image ls hello; echo; for t in a b c d e; do printf "hello:%s  configured user: %s\\n" $t "$(docker image inspect hello:$t --format "{{if .Config.User}}{{.Config.User}}{{else}}(none: root){{end}}")"; done',
        { label: 'docker image ls hello; docker image inspect --format "{{.Config.User}}" hello:a … hello:e' });
      ctx.result({ status: 'info', title: 'Sizes on disk (and compressed)', lines: r.out.split('\n').filter((l) => /^hello:/.test(l)) });
      return r.code === 0;
    },
  },
  // Slide 15's table: image A in both scanners, from the saved reports. No screenshot, so replay runs it live too.
  'p-scanners-a': {
    title: 'Image A in both scanners: counts, KEV, and why they differ',
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && python3 tools/both-scanners.py a`, { label: 'python3 tools/both-scanners.py a' });
      const g = await ctx.vm(`cd ${L} && python3 tools/both-scanners.py a --kev-ids | xargs env GRYPE_DB_AUTO_UPDATE=false GRYPE_DB_VALIDATE_AGE=false grype db search vuln 2>/dev/null | grep debian | tr -s " " | cut -d" " -f1-7`,
        { label: 'python3 tools/both-scanners.py a --kev-ids | xargs grype db search vuln | grep debian' });
      const out = r.out.trim().split('\n');
      const ROW = /^(Grype|Trivy.*?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/;
      const rows = out.map((l) => l.match(ROW)).filter(Boolean).map((m) => m.slice(1));
      const ok = r.code === 0 && rows.length >= 2;
      ctx.result({ status: ok ? 'info' : 'fail', title: out[0] || 'Image A, both scanners',
        rows: [['Scanner', 'Unique CVEs', 'Critical', 'High', 'On KEV', 'Fixable'], ...rows],
        lines: out.slice(1).filter((l) => !ROW.test(l) && !/^Scanner\s/.test(l)).concat(
          ["Grype's database has Trivy's extra KEV CVEs only for these Debian releases, not Debian 11 (its long-term support ended 31 August 2026):"],
          g.out.trim().split('\n').filter(Boolean)) });
      return ok && g.code === 0;
    },
  },
  'p-shell': {
    title: 'Is there a shell? (A and B yes; C, D and E no)', shots: ['14-final-d-no-shell.png', '11-image-c-run-checks.png'],
    live: async (ctx) => {
      const r = await ctx.vm('for t in a b c d e; do printf "hello:%s  " $t; docker run --rm --entrypoint sh hello:$t -c "echo a shell is present" 2>&1 | grep -m1 -oE "a shell is present|executable file not found in [$]PATH" | sed "s/^executable/no shell: sh: executable/"; done',
        { label: 'docker run --rm --entrypoint sh hello:<a,b,c,d,e> -c "echo a shell is present"' });
      ctx.result({ status: 'info', title: 'Shells', lines: r.out.trim().split('\n') });
      return true;
    },
  },
  'p-de': {
    title: 'D and E: the same scan, a different app', shots: ['37-d-and-e-same-scan.png', '37-d-vs-e-log.png', '37-d-vs-e-timeout.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && for i in d e; do echo "hello:$i  Grype $(jq "[.matches[].vulnerability.id] | unique | length" reports/final/$i-grype.json)  Trivy $(jq "[.Results[]?.Vulnerabilities[]?.VulnerabilityID] | unique | length" reports/final/$i-trivy.json)"; done; echo; bash tools/show-fixes.sh log; echo; bash tools/show-fixes.sh timeout`,
        { label: 'the saved scans of D and E; bash tools/show-fixes.sh log; bash tools/show-fixes.sh timeout', timeout: 120000 });
      const [dpart, epart = ''] = r.out.split('===== E');
      const ok = /hello:d\s+Grype 0\s+Trivy 0/.test(r.out) && /hello:e\s+Grype 0\s+Trivy 0/.test(r.out) && /"debug" mode/.test(dpart) && /203\.0\.113\.9/.test(dpart)
        && !/GIN-debug/.test(epart.split('Each app gets half')[0]) && /D: still open/.test(r.out) && /E: the server closed/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'Both scan to zero; only E is in release mode, ignores the forged IP and times out' : 'Unexpected output',
        lines: r.out.split('\n').filter((l) => /^hello:[de]|"debug" mode|trusted all proxies|\| +203\.0\.113\.9|\| +172\.|^D:|^E:/.test(l)).map((l) => l.trim()) });
      return r.code === 0;
    },
  },
  'p-diff-bc': {
    title: 'B to C: one line changes', shots: ['11-image-c-diff-b-c.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && diff <(grep -v "^#" dockerfiles/Dockerfile.b-multi) <(grep -v "^#" dockerfiles/Dockerfile.c-chainguard)`,
        { label: 'diff <(grep -v "^#" Dockerfile.b-multi) <(grep -v "^#" Dockerfile.c-chainguard)' });
      ctx.result({ status: 'info', title: 'The only difference between B and C', lines: r.out.trim().split('\n') });
      return true;
    },
  },
  'p-static-verify': {
    title: 'Chainguard\'s signature on the static base', shots: ['11-image-c-base-verified.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cosign verify ${STATIC} ${CG_ID} 2>&1 >/tmp/console-cg.json | grep -v "^$"; jq -r '.[0].optional.Subject' /tmp/console-cg.json`,
        { label: `cosign verify cgr.dev/chainguard/static@sha256:fc42af33… (keyless: Chainguard's release workflow)` });
      const ok = /chainguard-images\/images/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'Signed by Chainguard\'s release workflow' : 'verification failed', lines: r.out.trim().split('\n').slice(-2) });
      return ok;
    },
  },
  'p-image-d': {
    title: 'D: a current Go and updated modules', shots: ['13-image-d-binary-modules.png', '13-image-d-gomod-table.png'],
    live: async (ctx) => {
      const r = await ctx.vm('docker create --name console-tmp-d hello:d >/dev/null && docker cp -q console-tmp-d:/usr/local/bin/hello-server /tmp/console-hs-d && docker rm console-tmp-d >/dev/null; ' +
        `go version /tmp/console-hs-d; grep -E "^go |gin-gonic/gin " ${L}/go-updated/go.mod; ` +
        'echo "modules compiled in: $(go version -m /tmp/console-hs-d | grep -cP "^\\s+dep\\s")"',
      { label: 'go version -m on D\'s binary; grep "^go \\|gin" go-updated/go.mod' });
      ctx.result({ status: 'info', title: 'Image D\'s binary', lines: r.out.trim().split('\n') });
      return r.code === 0;
    },
  },
  'p-results': {
    title: 'The rescan of all five (saved results)', shots: ['37-results-five-images.png'],
    live: async (ctx) => {
      const py = 'import json\nd=json.load(open("results.json"))\nprint("image  size (compressed)   Grype unique  Trivy   KEV  govulncheck  fixable  by layer: OS / tools / stdlib / modules")\n' +
        'for k in "abcde":\n i=d["images"][k]; g=i["grype"]; t=i["trivy"]; b=g.get("by_layer",{})\n' +
        ' print("%-5s  %-20s  %-12s  %-6s  %-3s  %-11s  %-7s  %s / %s / %s / %s" % (k.upper(), i["size"]["disk"]+" ("+i["size"]["compressed"]+")", g["unique"], t["unique"], g["kev"], i["govulncheck_binary"], g["fixable"], b.get("os_packages",0), b.get("go_toolchain",0), b.get("go_stdlib",0), b.get("go_module",0)))\n' +
        's=d["scanners"]; print("scanned %s; Grype %s (database built %s); Trivy %s" % (s["scanned_on"], s["grype"]["version"], s["grype"]["db_built"], s["trivy"]["version"]))';
      const r = await ctx.run('python3: print results.json as a table', 'python3', ['-I', '-c', py], { cwd: CFG.lab });
      ctx.result({ status: 'info', title: 'Unique CVE IDs (Grype --by-cve), the same databases for all five', lines: r.out.trim().split('\n') });
      return r.code === 0;
    },
  },
  'p-rescan-d': {
    title: 'Rescan D and E now: Grype, Trivy, govulncheck (the recorded databases)', shots: ['37-d-and-e-same-scan.png'],
    live: async (ctx) => {
      const r = await ctx.vm('for t in d e; do echo "== hello:$t"; ' +
        'echo "Grype:       $(GRYPE_DB_AUTO_UPDATE=false GRYPE_DB_VALIDATE_AGE=false grype hello:$t --by-cve -q -o json 2>/dev/null | jq ".matches | length") matches"; ' +
        'echo "Trivy:       $(trivy image -q --skip-db-update --format json hello:$t 2>/dev/null | jq "[.Results[]?.Vulnerabilities[]?] | length") vulnerabilities"; ' +
        'docker create --name console-tmp-$t hello:$t >/dev/null && docker cp -q console-tmp-$t:/usr/local/bin/hello-server /tmp/console-hs-$t && docker rm console-tmp-$t >/dev/null; ' +
        'echo "govulncheck: $(govulncheck -mode binary /tmp/console-hs-$t 2>&1 | grep -m1 -E "No vulnerabilities found|Your code is affected")"; done; ' +
        'grype db status 2>/dev/null | grep -i -m1 built', { label: 'grype --by-cve and trivy image, with the recorded databases; govulncheck -mode binary: on D, then on E', timeout: 360000 });
      const zero = (r.out.match(/Grype:\s+0 /g) || []).length === 2 && (r.out.match(/Trivy:\s+0 /g) || []).length === 2;
      ctx.result({ status: zero ? 'pass' : 'fail', title: zero ? 'D and E are clean, rescanned now' : 'Findings: not what the lab recorded', lines: r.out.trim().split('\n') });
      return true;
    },
  },
  'p-triage': {
    title: 'CVE-2023-44487 in image B', shots: ['10-triage-http2-exposure.png', '09-scan-govulncheck.png'],
    live: async (ctx) => {
      const r = await ctx.sh('jq -r \'[.matches[] | select(.vulnerability.id == "CVE-2023-44487")] | .[] | "\\(.artifact.name) \\(.artifact.version): \\(.vulnerability.severity), CVSS \\([.vulnerability.cvss[]?.metrics.baseScore] | map(tostring) | join(" / ")), EPSS \\(.vulnerability.epss[0].epss // "-") (\\(.vulnerability.epss[0].date // "-")), fixed in \\(.vulnerability.fix.versions | join(", "))"\' reports/final/b-grype.json; ' +
        'echo "KEV: $(jq -r \'.vulnerabilities[] | select(.cveID == "CVE-2023-44487") | "added " + .dateAdded\' reports/final/cisa-kev.json)"; ' +
        'echo "govulncheck (binary mode, B):"; sed -n "/Vulnerability #[0-9]*: GO-2023-2102/,/Vulnerability #/p" reports/final/govulncheck-binary-abc.txt | sed "\\$d" | head -16',
      { cwd: CFG.lab, label: 'jq CVE-2023-44487 in reports/final/b-grype.json; the KEV catalog; govulncheck GO-2023-2102' });
      ctx.result({ status: 'info', title: 'HTTP/2 Rapid Reset in image B', lines: r.out.trim().split('\n').slice(0, 4) });
      return r.code === 0;
    },
  },
  'p-sbom': {
    title: 'An SBOM for E, generated now', shots: ['15-sbom-generated.png'],
    live: async (ctx) => {
      const r = await ctx.vm('syft hello:e -q -o spdx-json | jq -r "\\"SPDX \\" + .spdxVersion + \\", packages: \\" + (.packages | length | tostring) + \\", by type: \\" + ([.packages[].externalRefs[]? | select(.referenceType == \\"purl\\") | .referenceLocator | capture(\\"^pkg:(?<t>[^/]+)/\\").t] | group_by(.) | map(.[0] + \\"=\\" + (length|tostring)) | join(\\" \\"))"',
        { label: 'syft hello:e -o spdx-json | jq (version, package count, by type)' });
      ctx.result({ status: 'info', title: 'E\'s SBOM', lines: r.out.trim().split('\n') });
      return r.code === 0;
    },
  },
  'p-sign': {
    title: 'cosign verify: E passes, C and D fail', shots: ['37-sign-e-passes-c-d-fail.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && for t in e d c; do D=$(crane digest localhost:5000/hello:$t); ` +
        'if cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello@$D >/dev/null 2>/tmp/console-v.err; then echo "hello:$t  PASS: signed with our key (${D:0:19}…)"; ' +
        'else echo "hello:$t  FAIL: $(grep -i -m1 -E "error|no " /tmp/console-v.err | cut -c1-90)"; fi; done',
      { label: 'cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello@<E>, then <D>, then <C>' });
      ctx.result({ status: /hello:e\s+PASS/.test(r.out) && /hello:d\s+FAIL/.test(r.out) && /hello:c\s+FAIL/.test(r.out) ? 'pass' : 'fail', title: 'Signature checks', lines: r.out.trim().split('\n') });
      return true;
    },
  },
  'p-provenance': {
    title: 'Chainguard\'s SLSA provenance, verified', shots: ['29-chainguard-slsa-verified-wrapped.png', '22b-chainguard-slsa-contents.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`A=$(crane manifest ${STATIC} | jq -r '.manifests[] | select(.platform.architecture == "arm64") | .digest'); ` +
        `cosign verify-attestation --type https://slsa.dev/provenance/v1 ${CG_ID} cgr.dev/chainguard/static@$A 2>/tmp/console-p.err | head -1 | jq -r .payload | base64 -d > /tmp/console-p.json; ` +
        'grep -E "^  - |^Certificate subject" /tmp/console-p.err; jq -r \'"builder: " + .predicate.runDetails.builder.id, "packages: " + (.predicate.buildDefinition.internalParameters | to_entries | map(.key + " " + .value) | join(", "))\' /tmp/console-p.json',
      { label: 'cosign verify-attestation --type https://slsa.dev/provenance/v1 cgr.dev/chainguard/static (arm64), then read it' });
      const ok = /transparency log/.test(r.out) && /builder:/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'Signed SLSA provenance from Chainguard\'s release workflow' : 'verification failed', lines: r.out.trim().split('\n').slice(-3) });
      return ok;
    },
  },
  'p-k8s': {
    title: 'The pods and their security settings', shots: ['19-pods.png', '19-runtime-applied.png'],
    live: async (ctx) => {
      const r = await ctx.vm('kubectl get pods -l "app in (hello,hello-ai)" -o custom-columns=POD:.metadata.name,READY:.status.containerStatuses[0].ready,NODE:.spec.nodeName,IMAGE:.spec.containers[0].image; echo; ' +
        'echo "namespace default: $(kubectl get ns default -o jsonpath="{.metadata.labels.pod-security\\.kubernetes\\.io/enforce}") Pod Security"; ' +
        'echo "hello pod securityContext: $(kubectl get pods -l app=hello -o jsonpath="{.items[0].spec.securityContext}")"; ' +
        'echo "container: $(kubectl get pods -l app=hello -o jsonpath="{.items[0].spec.containers[0].securityContext}")"',
      { label: 'kubectl get pods; the namespace Pod Security label; the securityContext' });
      ctx.result({ status: 'info', title: 'Running on k3s', lines: r.out.trim().split('\n').filter((l) => /^(hello|namespace|hello pod|container)/.test(l)) });
      return r.code === 0;
    },
  },
  'p-kyverno-c': {
    title: 'Image C again: refused now', shots: ['19-unsigned-c-runs.png', '20-kyverno-signed-vs-unsigned.png'],
    live: async (ctx) => {
      const r = await ctx.vm('C=$(crane digest localhost:5000/hello:c); kubectl get ns bypass-test >/dev/null 2>&1 || kubectl create ns bypass-test >/dev/null; ' +
        `kubectl run unsigned-c-$(date +%H%M%S) -n bypass-test --restart=Never --image=${CFG.registry}/hello@$C 2>&1`,
      { label: `kubectl run … --image=${CFG.registry}/hello@<C's digest>   (C has no signature)` });
      const refused = /denied the request/.test(r.out);
      ctx.result({ status: refused ? 'pass' : 'fail', title: refused ? 'Refused: C ran at step 19, the policy added at step 20 stops it' : 'NOT refused', lines: (r.out.match(/The image must be signed[^\n]*/) || [r.out.trim()]).slice(0, 1) });
      return refused;
    },
  },
  'p-debug-d': {
    title: 'Get into E without a shell (Docker)', shots: ['31-debug-d-docker.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && bash tools/debug-e.sh docker`,
        { label: 'bash tools/debug-e.sh docker   (docker exec; a debug container sharing E\'s processes and network; docker cp)' });
      const ok = /executable file not found/.test(r.out) && /hello-server/.test(r.out) && /copied out, \d+ bytes/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'No shell in E, and still inspectable, as the same non-root user' : 'Unexpected output',
        lines: r.out.split('\n').filter((l) => /^(1\.|2\.|3\.)|user:|hello-server$|LISTEN/.test(l)).map((l) => l.trim()) });
      return r.code === 0;
    },
  },
  'p-manifests': {
    title: 'The manifests match what the cluster runs (image E)', shots: ['32-manifests-match-cluster.png', '32-manifests-namespace-service.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && bash tools/check-manifests.sh`,
        { label: 'bash tools/check-manifests.sh   (dry run; kubectl diff; the digest in the file, the cluster and the registry; cosign verify)' });
      const d = (r.out.match(/(file|cluster|registry): +(sha256:[0-9a-f]{64})/g) || []).map((l) => l.split(/ +/).pop());
      const ok = /exit 0, 0 lines of difference/.test(r.out) && /cosign verify exit 0/.test(r.out) && d.length === 3 && new Set(d).size === 1;
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'No difference: the cluster runs the files, by the signed digest' : 'The files and the cluster differ',
        lines: r.out.split('\n').filter((l) => /unchanged|lines of difference|file:|cluster:|registry:|cosign verify exit|enforce=|ready=/.test(l)).map((l) => l.trim()) });
      return r.code === 0;
    },
  },
  'p-debug-k8s': {
    title: 'Get into E on k3s: kubectl debug, restricted', shots: ['31-debug-d-k3s.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && bash tools/debug-e.sh k3s`,
        { label: 'bash tools/debug-e.sh k3s   (kubectl exec; kubectl debug --target=hello --profile=restricted; then the pod is replaced)' });
      const ok = /executable file not found/.test(r.out) && /admitted with: allowPrivilegeEscalation=false/.test(r.out) && /debug containers left: 0/.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'kubectl exec fails; kubectl debug gets in, under the restricted level' : 'Unexpected output',
        lines: r.out.split('\n').filter((l) => /^(Pod|1\.|2\.|3\.)|user:|hello-server$|LISTEN|admitted with|now:/.test(l)).map((l) => l.trim()) });
      return r.code === 0;
    },
  },
  'p-debug-gap': {
    title: 'The side door: an unsigned image as a debug container', shots: ['31-debug-gap.png'],
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && bash tools/debug-e.sh gap`,
        { label: 'bash tools/debug-e.sh gap   (unsigned C as a pod, then as a debug container; then the pod is replaced)' });
      const refused = /refused: The image must be signed/.test(r.out), admitted = /admitted: /.test(r.out) && /Listening/.test(r.out);
      ctx.result({ status: admitted ? 'fail' : 'pass',
        title: admitted ? (refused ? 'Side door open: C is refused as a pod, admitted as a debug container' : 'C admitted as a debug container') : 'Side door closed: C refused both ways',
        lines: r.out.split('\n').filter((l) => /refused:|admitted:|Listening|bind|Why:|ephemeralcontainers|now:/.test(l)).map((l) => l.trim()) });
      return r.code === 0;
    },
  },
  'p-wrong': {
    title: 'The evidence behind "what went wrong"', shots: ['10-triage-gap-analysis.png', '11-image-c-compare-abc.png', '11-image-c-binary-sizes.png', '19-unsigned-c-runs.png', '31-debug-gap.png'],
    live: async (ctx) => {
      const r = await ctx.vm(String.raw`cd ${L} && echo "1. Two scanners, two counts:"; echo "   $(grep -o "explains 91 of the 92[^.]*" REPORT.md | head -1)"; ` +
        String.raw`echo; echo "2. No base reaches the binary: the app binary in B and C, and Grype's CVEs by layer"; ` +
        String.raw`for i in b c; do docker create --name console-tmp-$i hello:$i >/dev/null && docker cp -q console-tmp-$i:/usr/local/bin/hello-server /tmp/console-bin-$i && docker rm console-tmp-$i >/dev/null; echo "   $i: binary sha256 $(sha256sum < /tmp/console-bin-$i | cut -c1-16)"; done; ` +
        String.raw`jq -r '.images | to_entries[] | select(.key | test("^[abc]$")) | "   " + .key + ": OS " + ((.value.grype.by_layer.os_packages // 0) | tostring) + ", standard library " + ((.value.grype.by_layer.go_stdlib // 0) | tostring) + ", modules " + ((.value.grype.by_layer.go_module // 0) | tostring)' results.json; ` +
        String.raw`echo; echo "3. Signed isn't enforced:"; C=$(crane digest localhost:5000/hello:c); ` +
        String.raw`if cosign verify --key cosign.pub --insecure-ignore-tlog=true localhost:5000/hello@$C >/dev/null 2>/tmp/console-v.err; then echo "   C: signed (unexpected)"; else echo "   C: $(grep -m1 -oi "no signatures found" /tmp/console-v.err), yet it ran on the cluster at step 19 (F26)"; fi; ` +
        String.raw`echo "   the policy added at step 20: $(kubectl get imagevalidatingpolicies -o name 2>/dev/null | tr '\n' ' ')"; ` +
        String.raw`echo "   debug containers: $(grep -q '^| F32 |.*| Open\.' JOURNAL.md && echo 'still open: an unsigned image gets in as a debug container (F32)' || echo 'F32 closed')"`,
      { label: 'REPORT.md (gap analysis); the app binary in B and C, and results.json by layer; cosign verify on C; the policy; F32' });
      const same = (r.out.match(/binary sha256 (\w+)/g) || []);
      const ok = r.code === 0 && same.length === 2 && same[0] === same[1] && /no signatures found/i.test(r.out);
      ctx.result({ status: ok ? 'pass' : 'fail', title: ok ? 'The same binary in B and C; C unsigned, refused only once a policy checks' : 'Not what the lab recorded', lines: r.out.trim().split('\n').filter(Boolean) });
      return ok;
    },
  },
};

// the quick answers: each runs its command live and puts the first lines in the result card. A deck-only command
// waits for a person to type (a password), which this page's terminal can't do, so it isn't offered here.
for (const g of GROUPS) {
  for (const [id, title, cmd, o = {}] of g.items) {
    if (o.deckOnly) continue;
    A[id] = {
      title,
      live: async (ctx) => {
        const r = o.on === 'k3s'
          ? await ctx.run(`multipass exec ${CFG.k3sVm} -- ${cmd}`, 'multipass', ['exec', CFG.k3sVm, '--', 'bash', '-lc', cmd])
          : await ctx.vm(`cd ${L} && ${cmd}`, { label: cmd });
        const out = r.out.replace(/\s+$/, '').split('\n');
        const more = out.length > 16 ? [`… ${out.length - 16} more lines in the terminal`] : [];
        ctx.result({ status: r.code === 0 ? 'info' : 'fail', title, lines: out.slice(0, 16).concat(more) });
        return r.code === 0;
      },
    };
  }
}

// The Dockerfiles, one proof each (slides 60 to 64). No screenshots: printing a file only reads it, so replay runs it live.
const DF = {
  a: ['Dockerfile A: single-stage, built and run in golang:1.18', ['The baseline: golang:1.18 (Debian 11, Go 1.18.10) builds the app and ships with it.',
      'Dependencies first, so go mod download stays cached when only the code changes.', 'No USER line, so it runs as root; CMD starts ./hello-server.',
      'Ships: 1.49 GB · root · a shell · 734 CVEs (Grype), 3 on CISA\'s KEV list.']],
  b: ['Dockerfile B: multi-stage, only the binary ships', ['A second stage on debian:trixie-slim; only the binary crosses over (COPY --from=build).',
      'The build stage is A\'s, so it comes from the cache.', 'USER 65532 has no /etc/passwd entry here, so its group is 0 (F12); ENTRYPOINT replaces CMD.',
      'Ships: 155 MB · 65532:0 · a shell · 161 CVEs, 1 on KEV.']],
  c: ['Dockerfile C: one line changed, Chainguard\'s static runtime', ['One line: the runtime FROM becomes chainguard/static, pinned by digest, its signature verified with cosign.',
      'The builder stays golang:1.18, so the Go version doesn\'t change at the same time.',
      'Ships: 19 MB · 65532:65532 · no shell · 69 CVEs, all in the binary, 1 on KEV.']],
  d: ['Dockerfile D: Chainguard\'s Go builder, updated modules', ['The builder becomes chainguard/go (Go 1.27.4), pinned by digest; GOTOOLCHAIN=local.',
      'Built from go-updated/: go.mod updated with go get -u (Gin 1.8.1 → 1.12.0); main.go as delivered. Runtime: C\'s static image.',
      'Ships: 34.9 MB · 65532:65532 · no shell · 0 CVEs · unsigned, never deployed.']],
  e: ['Dockerfile E: D plus the app\'s own fixes', ['One line in the file: ENV GIN_MODE=release (F1).',
      'Built from go-patched/: D\'s go.mod, and main.go fixed: no trusted proxies (F2), an http.Server with timeouts (F8).',
      'Ships: 34.9 MB · 65532:65532 · no shell · 0 CVEs · signed, deployed on k3s.']],
};
for (const [k, [title, lines]] of Object.entries(DF)) {
  A[`p-df-${k}`] = {
    title,
    live: async (ctx) => {
      const r = await ctx.vm(`cd ${L} && bash tools/show-dockerfile.sh ${k}`, { label: `bash tools/show-dockerfile.sh ${k}` });
      const ok = /\bFROM\b/.test(r.out);
      ctx.result({ status: ok ? 'info' : 'fail', title: ok ? title : 'The file could not be read', lines });
      return ok;
    },
  };
}

module.exports = { name: 'present', actions: A, meta: { sections: SECTIONS, actions: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, { title: v.title, shots: v.shots }])) } };
