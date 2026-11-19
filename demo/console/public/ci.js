// demo/console/public/ci.js: the CI demo page. The pipeline diagram, the step list and the mapping panel.
'use strict';
(function () {
  const { esc } = Console;
  let META = null, selected = 'ci-agent-write', STATE = {}, currentAction = null, view = 'step', play = null, lastOwn = null;

  // ---------- the diagram: the pipeline as it runs in the lab, drawn like a production agentic CI ----------
  // Solid parts are what the lab runs. Dashed parts tagged "production · not in lab" are what a production
  // pipeline adds at the same place; nothing in the demo lights them up.
  const ZONES = [
    ['mac', 'Developer Mac', 'agent and reviewer', 8, 292],
    ['gh', 'GitHub', 'private repo · hello-ai', 312, 248],
    ['vm', 'Build VM', 'self-hosted runner · 192.168.252.2', 572, 434],
    ['k8s', 'k3s cluster', '192.168.252.3', 1018, 294],
  ];
  // id: [zone, x, y, w, h, icon, title, sub, extra]
  const NODES = {
    'mac-issue': ['mac', 22, 50, 228, 46, 'issue', 'Issue tracker', 'assigns the task', { prod: true }],
    'mac-agent': ['mac', 22, 118, 228, 122, 'agent', 'Coding agent', 'headless, allowlisted tools', {
      rules: [[true, 'read, edit and write files'], [true, 'fix run: gh logs, dfc, crane'], [false, 'no git, no docker build']] }],
    'mac-me': ['mac', 22, 262, 228, 56, 'person', 'Me · reviewer', 'review, push, merge'],
    'mac-skill': ['mac', 22, 342, 228, 62, 'doc', 'Installed skill', 'chainguard-dockerfile', { sub2: 'copied only if the scan passes' }],
    'gh-review': ['gh', 336, 50, 200, 46, 'agent', 'AI reviewer', 'comments on the diff', { prod: true }],
    'gh-pr': ['gh', 336, 118, 200, 52, 'pr', 'Pull request', 'the agent\'s change'],
    'gh-check': ['gh', 336, 196, 200, 52, 'check', 'Check: gate', 'red, then green'],
    'gh-rule': ['gh', 336, 264, 200, 52, 'merge', 'Merge to main', 'free plan: not enforced'],
    'gh-required': ['gh', 336, 356, 200, 46, 'shield', 'Required check', 'merge waits for green', { prod: true }],
    'vm-runner': ['vm', 598, 50, 382, 46, 'play', 'Runner · self-hosted', 'asks GitHub for jobs, outbound only'],
    'vm-gate': ['vm', 598, 118, 382, 122, 'list', 'gate.sh', '7 checks · one FAIL blocks the change', {
      chips: [['base image', 'base image'], ['base signed', 'base signed'], ['pinned deps', 'pinned deps'], ['cooldown', 'cooldown'], ['build', 'build'], ['user', 'user'], ['scan', 'scan']] }],
    'vm-deploy': ['vm', 598, 262, 382, 78, 'deploy', 'deploy.sh', 'after a merge: the gate again, then', {
      flow: [['push', 'push'], ['sign', 'sign'], ['verify', 'verify'], ['apply', 'apply']] }],
    'vm-sbom': ['vm', 598, 362, 184, 46, 'doc', 'Attestations', 'SBOM + provenance', { prod: true }],
    'vm-registry': ['vm', 794, 362, 186, 46, 'stack', 'Registry :5000', 'image by digest'],
    'vm-skillspector': ['vm', 598, 426, 382, 74, 'scan', 'SkillSpector · skill gate', 'scans each skill before the agent may load it', {
      pair: [['s-dockerfile-fixer', 'dockerfile-fixer'], ['s-chainguard-dockerfile', 'chainguard-dockerfile']] }],
    'k8s-gitops': ['k8s', 1040, 50, 258, 46, 'sync', 'GitOps controller', 'syncs the cluster from Git', { prod: true }],
    'k8s-policy': ['k8s', 1040, 118, 258, 72, 'shield', 'Admission · Kyverno', 'signed with the lab key?', { sub2: 'if not: Deny' }],
    'k8s-refused': ['k8s', 1040, 262, 200, 52, 'noentry', 'Unsigned image', 'refused at admission'],
    'k8s-pods': ['k8s', 1040, 362, 258, 46, 'hex', 'Pods · hello-ai', 'the signed digest runs'],
  };
  // id: [path, class, labels [[text, x, y, anchor]]]
  const EDGES = {
    'e-issue-agent': ['M136 96 V118', 'prod', [['task', 144, 111, 'start']]],
    'e-agent-pr': ['M250 144 H336', '', [['its change', 293, 138, 'middle'], ['my commit', 293, 158, 'middle']]],
    'e-agent-me': ['M136 240 V262', '', [['diff to review', 144, 255, 'start']]],
    'e-review-pr': ['M436 96 V118', 'prod', [['review notes', 444, 111, 'start']]],
    'e-check-agent': ['M336 222 H250', 'loop', [['failed log', 293, 216, 'middle']]],
    'e-me-rule': ['M250 290 H336', '', [['merge', 293, 284, 'middle']]],
    'e-required-rule': ['M436 356 V316', 'prod', [['blocks until green', 444, 339, 'start']]],
    'e-pr-runner': ['M536 136 H567 V73 H598', '', [['job', 561, 108, 'end']]],
    'e-runner-gate': ['M789 96 V118', '', [['checkout, ./gate.sh', 797, 111, 'start']]],
    'e-gate-check': ['M598 222 H536', '', [['verdict', 567, 216, 'middle']]],
    'e-rule-deploy': ['M536 290 H598', '', [['deploy job', 567, 284, 'middle']]],
    'e-deploy-sbom': ['M610 340 V362', 'prod', []],
    'e-deploy-registry': ['M887 340 V362', '', [['push, sign', 895, 355, 'start']]],
    'e-deploy-admit': ['M980 290 H1010 V160 H1040', '', [['apply', 995, 284, 'middle']]],
    'e-gitops-admit': ['M1169 96 V118', 'prod', [['applies from Git', 1177, 111, 'start']]],
    'e-policy-refused': ['M1140 190 V262', 'deny', [['deny', 1148, 230, 'start']]],
    'e-policy-pods': ['M1270 190 V362', 'admit', [['admit', 1276, 280, 'start']]],
    'e-registry-pods': ['M980 385 H1040', '', [['pull', 1010, 379, 'middle']]],
    'e-skills-scan': ['M789 522 V500', '', [['two candidates', 797, 515, 'start']]],
    'e-skill-install': ['M598 463 H136 V404', 'admit', [['allowed: installed', 370, 457, 'middle']]],
    'e-skill-agent': ['M22 373 H13 V200 H22', '', []],
  };
  // small line icons, drawn around 0,0 in a 16 by 16 box
  const ICONS = {
    issue: '<circle r="6.5" class="ic-s"/><circle r="2" class="ic-f"/>',
    agent: '<path class="ic-f" d="M0-8C1.1-2.6 2.6-1.1 8 0C2.6 1.1 1.1 2.6 0 8C-1.1 2.6-2.6 1.1-8 0C-2.6-1.1-1.1-2.6 0-8Z"/>',
    person: '<circle cy="-3.2" r="3.2" class="ic-s"/><path class="ic-s" d="M-6.5 7.5C-6.5 2.5 6.5 2.5 6.5 7.5"/>',
    pr: '<circle cx="-4" cy="-5" r="2" class="ic-s"/><circle cx="-4" cy="5" r="2" class="ic-s"/><circle cx="4.5" cy="5" r="2" class="ic-s"/><path class="ic-s" d="M-4-3V3M4.5 3V-2.5C4.5-4 3.5-5 2-5H-0.5"/>',
    check: '<circle r="7" class="ic-s"/><path class="ic-s" d="M-3.5 0.2L-1 2.8L3.6-2.4"/>',
    merge: '<circle cx="-4" cy="-5.5" r="2" class="ic-s"/><circle cx="-4" cy="5.5" r="2" class="ic-s"/><circle cx="4.5" cy="1" r="2" class="ic-s"/><path class="ic-s" d="M-4-3.5V3.5M-4-2.5C-4 1 0 1 2.5 1"/>',
    shield: '<path class="ic-s" d="M0-7.5L6.3-5V0C6.3 4.2 3.4 6.6 0 7.8C-3.4 6.6-6.3 4.2-6.3 0V-5Z"/><path class="ic-s" d="M-2.6 0L-0.6 2.1L2.8-1.8"/>',
    play: '<path class="ic-f" d="M-3.5-6L6 0L-3.5 6Z"/>',
    list: '<path class="ic-s" d="M-2.5-5H7M-2.5 0H7M-2.5 5H7"/><circle cx="-6" cy="-5" r="1.2" class="ic-f"/><circle cx="-6" cy="0" r="1.2" class="ic-f"/><circle cx="-6" cy="5" r="1.2" class="ic-f"/>',
    deploy: '<path class="ic-s" d="M0 5V-7M-5-2.2L0-7L5-2.2M-6.5 7.5H6.5"/>',
    doc: '<path class="ic-s" d="M-5-7.5H2L5.5-4V7.5H-5.5V-7.5ZM2-7.5V-4H5.5M-2.5 0H3M-2.5 3.5H3"/>',
    stack: '<rect x="-6.5" y="-7" width="13" height="4.4" rx="1" class="ic-s"/><rect x="-6.5" y="-2.2" width="13" height="4.4" rx="1" class="ic-s"/><rect x="-6.5" y="2.6" width="13" height="4.4" rx="1" class="ic-s"/>',
    sync: '<path class="ic-s" d="M6-1.5A6 6 0 0 0-5.2-3.2M-6 1.5A6 6 0 0 0 5.2 3.2M-5.2-3.2L-6.6-6.4M-5.2-3.2L-1.8-3.6M5.2 3.2L6.6 6.4M5.2 3.2L1.8 3.6"/>',
    hex: '<path class="ic-s" d="M0-7.5L6.5-3.75V3.75L0 7.5L-6.5 3.75V-3.75Z"/><circle r="2" class="ic-f"/>',
    noentry: '<circle r="7" class="ic-s"/><path class="ic-s" d="M-4.9-4.9L4.9 4.9"/>',
    scan: '<circle cx="-1.5" cy="-1.5" r="5.2" class="ic-s"/><path class="ic-s" d="M2.4 2.4L6.8 6.8"/>',
  };
  const GATE_ACTIONS = /^(ci-gate|ci-gate-2|ci-hook|ci-merge|warmup)$/;

  function drawDiagram() {
    let s = '<svg viewBox="0 0 1320 570" role="img" aria-label="The pipeline: a coding agent and a reviewer on the Mac, the pull request, gate check and merge on GitHub, the self-hosted runner with gate.sh, deploy.sh and the registry on the build VM, and admission control and pods on k3s. Dashed parts are production practice, not in the lab.">';
    s += '<defs>' +
      [['dg-a', '#57606A'], ['dg-ah', '#0969DA'], ['dg-ap', '#8C959F'], ['dg-al', '#9A6700'], ['dg-ag', '#1A7F37'], ['dg-ab', '#CF222E']].map(([id, c]) =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('') +
      '</defs>';
    s += '<rect class="dg-bg" x="0" y="0" width="1320" height="570"/>';
    for (const [id, name, sub, x, w] of ZONES) {
      s += `<g class="zone z-${id}"><rect x="${x}" y="8" width="${w}" height="504" rx="12"/>` +
        `<text class="zt" x="${x + 14}" y="29.5">${esc(name)}</text><text class="zs" x="${x + w - 12}" y="29.5" text-anchor="end">${esc(sub)}</text></g>`;
    }
    for (const [id, [d, cls, labels]] of Object.entries(EDGES)) {
      s += `<g class="edge ${cls}" data-id="${id}"><path d="${d}"/>` +
        labels.map(([t, x, y, a]) => `<text x="${x}" y="${y}" text-anchor="${a}">${esc(t)}</text>`).join('') + '</g>';
    }
    for (const [id, [zone, x, y, w, h, icon, title, sub, extra = {}]] of Object.entries(NODES)) {
      const touched = META && META.chainguard && META.chainguard.view.some((v) => v.onDiagram && v.where === id);
      s += `<g class="node z-${zone}${extra.prod ? ' prod' : ''}${touched ? ' cg-touch' : ''}" data-id="${id}"><rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>` +
        `<g class="ic" transform="translate(${x + 20} ${y + 16}) scale(0.95)">${ICONS[icon] || ''}</g>` +
        `<text class="nt" x="${x + 38}" y="${y + 21}">${esc(title)}</text><text class="ns" x="${x + 38}" y="${y + 37}">${esc(sub)}</text>`;
      if (extra.sub2) s += `<text class="ns" x="${x + 38}" y="${y + 53}">${esc(extra.sub2)}</text>`;
      if (extra.prod) s += `<g class="pill"><rect x="${x + w - 146}" y="${y - 9}" width="136" height="16" rx="8"/><text x="${x + w - 78}" y="${y + 2.6}" text-anchor="middle">production · not in lab</text></g>`;
      if (extra.rules) extra.rules.forEach(([ok, t], i) => {
        const ty = y + 62 + i * 19;
        s += `<text class="rule ${ok ? 'yes' : 'no'}" x="${x + 16}" y="${ty}"><tspan class="mk">${ok ? '✓' : '✗'}</tspan> ${esc(t)}</text>`;
      });
      if (extra.chips) {
        const per = [4, 3], gap = 6, inner = w - 24;
        let k = 0;
        per.forEach((n, row) => {
          const cw = (inner - gap * (n - 1)) / n;
          for (let i = 0; i < n; i++, k++) {
            const [key, label] = extra.chips[k]; const cx = x + 12 + i * (cw + gap), cy = y + 52 + row * 34;
            s += `<g class="chip" data-chip="${esc(key)}"><title>${esc(key)}</title><rect x="${cx}" y="${cy}" width="${cw}" height="26" rx="6"/><text x="${cx + cw / 2}" y="${cy + 17.2}" text-anchor="middle"><tspan class="mk"></tspan>${esc(label)}</text></g>`;
          }
        });
      }
      if (extra.pair) {
        const gap = 8, cw = (w - 24 - gap) / 2;
        extra.pair.forEach(([key, label], i) => {
          const cx = x + 12 + i * (cw + gap), cy = y + 44;
          s += `<g class="chip" data-chip="${esc(key)}"><rect x="${cx}" y="${cy}" width="${cw}" height="24" rx="6"/><text x="${cx + cw / 2}" y="${cy + 16.2}" text-anchor="middle"><tspan class="mk"></tspan>${esc(label)}</text></g>`;
        });
      }
      if (extra.flow) {
        const n = extra.flow.length, gap = 22, inner = w - 28, cw = (inner - gap * (n - 1)) / n;
        extra.flow.forEach(([key, label], i) => {
          const cx = x + 14 + i * (cw + gap), cy = y + 44;
          s += `<g class="chip" data-chip="d-${esc(key)}"><rect x="${cx}" y="${cy}" width="${cw}" height="26" rx="6"/><text x="${cx + cw / 2}" y="${cy + 17.2}" text-anchor="middle"><tspan class="mk"></tspan>${esc(label)}</text></g>`;
          if (i < n - 1) s += `<path class="flowarrow" d="M${cx + cw + 6} ${cy + 13} H${cx + cw + gap - 6}" marker-end="url(#dg-a)"/>`;
        });
      }
      s += '</g>';
    }
    // upstream inputs and the legend
    s += '<g class="band"><rect x="8" y="522" width="1304" height="40" rx="8"/>' +
      '<text class="zt up" x="24" y="546.5">Upstream</text>' +
      '<g class="upchip" data-id="up-cg"><rect x="108" y="530" width="268" height="24" rx="6"/><text x="120" y="546.3">cgr.dev/chainguard/python · signed, by digest</text></g>' +
      '<g class="upchip" data-id="up-pypi"><rect x="384" y="530" width="180" height="24" rx="6"/><text x="396" y="546.3">PyPI · exact pins, 7+ days old</text></g>' +
      '<g class="upchip" data-id="up-skills"><rect x="572" y="530" width="300" height="24" rx="6"/><text x="584" y="546.3">Agent skills · public registry, vetted catalog</text></g>' +
      '<g class="legend">' + [['lg-run', 890, 'in progress'], ['lg-ok', 986, 'passed'], ['lg-bad', 1058, 'failed'], ['lg-prod', 1124, 'not in the lab']]
        .map(([c, lx, t]) => `<rect class="${c}" x="${lx}" y="536" width="16" height="12" rx="3"/><text x="${lx + 22}" y="546.3">${t}</text>`).join('') + '</g>' +
      '<g class="cgtoggle" role="button" tabindex="0" aria-pressed="false" aria-label="Show where Chainguard helps"><title>Show where Chainguard\'s products fit this pipeline</title><rect x="1224" y="530" width="80" height="24" rx="12"/><text x="1264" y="546.3" text-anchor="middle">Chainguard</text></g></g>';
    s += cgPills();
    s += cgViewTags();
    s += '</svg>';
    document.getElementById('diagram').innerHTML = s;
    bindCg();
  }
  // Where Chainguard helps: a pill per product on the node it meets, hidden until the Chainguard switch is on
  function cgPills() {
    const cg = META && META.chainguard; if (!cg) return '';
    let out = '<g class="cgpills">';
    for (const [id, prods] of Object.entries(cg.pills)) {
      let x, y, w, h, top;
      if (NODES[id]) { [, x, y, w, h] = NODES[id]; top = /^(mac-issue|gh-review|vm-runner|k8s-gitops)$/.test(id); }
      else { const m = { 'up-cg': [108, 530, 268, 24], 'up-pypi': [384, 530, 180, 24], 'up-skills': [572, 530, 300, 24] }[id]; if (!m) continue; [x, y, w, h] = m; top = true; }
      let px = id.startsWith('up-') ? x + 8 : x + w - 8;
      // above the box for the top row and the upstream chips, inside the coding agent's box (under its rules), else on the bottom edge
      const py = id.startsWith('up-') ? y - 15 : top ? y - 9 : id === 'mac-agent' ? y + h - 19 : y + h - 5;
      const items = id.startsWith('up-') ? prods : prods.slice().reverse();
      for (const pr of items) {
        const label = `${pr.short} · ${pr.shortStatus}`, pw = Math.round(label.length * 5.7 + 22);
        const left = id.startsWith('up-') ? px : px - pw;
        out += `<g class="cgpill"><title>${esc(`${pr.name}: ${pr.status} (checked ${cg.CHECKED}). ${pr.what} In this lab: ${pr.lab}`)}</title>` +
          `<rect x="${left}" y="${py}" width="${pw}" height="17" rx="8.5"/><circle cx="${left + 9}" cy="${py + 8.5}" r="3"/><text x="${left + 16}" y="${py + 12.2}">${esc(label)}</text></g>`;
        px = id.startsWith('up-') ? left + pw + 6 : left - 6;
      }
    }
    return out + '</g>';
  }
  // Step 12, the Chainguard view: a tag per product where it meets the pipeline, styled by what it does there
  // (filled: replaces, outlined: adds, green: in use, dashed: works with, grey: stays yours), and less used parts dimmed
  const VIEW_POS = { 'vm-runner': 'top', 'vm-skillspector': 'top', 'vm-deploy': 'top', 'mac-agent': 'inside', 'k8s-policy': 'inside-right' };
  function cgViewTags() {
    const cg = META && META.chainguard; if (!cg || !cg.view) return '';
    const byNode = {};
    for (const v of cg.view.filter((x) => x.onDiagram)) (byNode[v.where] = byNode[v.where] || []).push(v);
    let out = '<g class="cgviewg">';
    for (const [id, list] of Object.entries(byNode)) {
      let x, y, w, h; const band = { 'up-cg': [108, 530, 268, 24], 'up-pypi': [384, 530, 180, 24], 'up-skills': [572, 530, 300, 24] }[id];
      if (band) [x, y, w, h] = band; else if (NODES[id]) [, x, y, w, h] = NODES[id]; else continue;
      const pos = band ? 'above' : VIEW_POS[id] || 'bottom';
      const py = pos === 'above' ? y - 15 : pos === 'top' ? y - 9 : pos === 'inside' ? y + h - 19 : pos === 'inside-right' ? y + 44 : y + h - 5;
      let px = band ? x + 8 : x + w - 8;
      for (const v of (band ? list : list.slice().reverse())) {
        const label = v.product ? `${v.product.short} · ${v.product.shortStatus}` : 'stays yours';
        const pw = Math.round(label.length * 5.7 + 22), left = band ? px : px - pw;
        const tip = v.product ? `${v.verb}: ${v.product.name}, ${v.product.status}. ${v.change}` : `stays yours: ${v.change}`;
        out += `<g class="cgtag v-${v.verb.replace(/\s+/g, '-')}"><title>${esc(tip)}</title><rect x="${left}" y="${py}" width="${pw}" height="17" rx="8.5"/>` +
          `<circle cx="${left + 9}" cy="${py + 8.5}" r="3"/><text x="${left + 16}" y="${py + 12.2}">${esc(label)}</text></g>`;
        px = band ? left + pw + 6 : left - 6;
      }
    }
    return out + '</g>';
  }
  function drawCgPanel() {
    const cg = META && META.chainguard; const el = document.getElementById('cgrows'); if (!cg || !el) return;
    const where = (id) => ({ 'up-cg': 'Base images', 'up-pypi': 'Dependencies', 'up-skills': 'Agent skills' }[id] || (NODES[id] ? NODES[id][6] : id));
    el.innerHTML = cg.view.map((v) => `<span class="w">${esc(where(v.where))}</span><span class="vb v-${v.verb.replace(/\s+/g, '-')}">${esc(v.verb)}</span>` +
      `<span class="p">${v.product ? `<a href="${esc(v.product.url)}" target="_blank" rel="noopener">${esc(v.product.name)}</a>` : '—'}</span>` +
      `<span class="s">${v.product ? esc(v.product.cell) : ''}</span><span class="c" title="${esc(v.change)}">${esc(v.change)}</span>`).join('');
    document.getElementById('cgchecked').textContent = cg.CHECKED;
  }
  function setCgView(on) {
    document.body.classList.toggle('cgview', on);
    const svg = document.querySelector('.diagram svg'); if (svg) svg.classList.toggle('cg-view', on);
    const p = document.getElementById('cgpanel'); if (p) p.hidden = !on;
    if (on) drawCgPanel();
  }
  function setCg(on) {
    const svg = document.querySelector('.diagram svg'); if (!svg) return;
    svg.classList.toggle('cg-on', on);
    const t = svg.querySelector('.cgtoggle'); if (t) t.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('ci-cg', on ? '1' : '0'); } catch {}
  }
  function bindCg() {
    const t = document.querySelector('.diagram .cgtoggle'); if (!t) return;
    const flip = () => setCg(!document.querySelector('.diagram svg').classList.contains('cg-on'));
    t.addEventListener('click', flip);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    let on = false; try { on = localStorage.getItem('ci-cg') === '1'; } catch {}
    setCg(on);
  }
  function highlight(nodes, edges) {
    document.querySelectorAll('.diagram .node.hot').forEach((n) => { n.classList.remove('hot'); n.classList.add('seen'); });
    document.querySelectorAll('.diagram .edge.hot').forEach((e) => e.classList.remove('hot'));
    for (const n of nodes || []) { const el = document.querySelector(`.diagram .node[data-id="${n}"]`); if (el) { el.classList.remove('seen', 'good', 'badn'); el.classList.add('hot'); } }
    for (const e of edges || []) { const el = document.querySelector(`.diagram .edge[data-id="${e}"]`); if (el) el.classList.add('hot'); }
  }
  function mark(node, good) { const el = document.querySelector(`.diagram .node[data-id="${node}"]`); if (el) { el.classList.remove('hot', 'seen'); el.classList.add(good ? 'good' : 'badn'); } }
  // the gate's seven checks and deploy.sh's four steps light up from the real output lines
  const MK = { pass: '✓ ', fail: '✗ ' };
  function setChip(c, state) {
    c.classList.remove('run', 'pass', 'fail', 'skip'); if (state) c.classList.add(state);
    const mk = c.querySelector('.mk'); if (mk) mk.textContent = MK[state] || '';
  }
  function chips(sel, state) { document.querySelectorAll(`.diagram .chip${sel}`).forEach((c) => setChip(c, state)); }
  function chip(key, state) { const c = document.querySelector(`.diagram .chip[data-chip="${key}"]`); if (c) setChip(c, state); }
  function chipsFromLine(s) {
    const i = s.search(/(PASS|FAIL) {2}/);   // "PASS  base image   …", also after a Git hook's "remote: "
    if (i >= 0) chip(s.substr(i + 6, 12).trim(), s.substr(i, 4) === 'PASS' ? 'pass' : 'fail');
    if (/^SIGNED /.test(s)) ['d-push', 'd-sign', 'd-verify'].forEach((k) => chip(k, 'pass'));
    if (/successfully rolled out|^DEPLOYED /.test(s)) chip('d-apply', 'pass');
    const sk = s.match(/^(ALLOWED|BLOCKED)\s+(\S+)/);
    if (sk) chip('s-' + sk[2], sk[1] === 'ALLOWED' ? 'pass' : 'fail');
  }

  // ---------- steps ----------
  function stepCard(s, isExtra) {
    const st = (STATE.steps || {})[s.id];
    const cls = s.id === currentAction ? 'running' : st ? (st.ok ? 'ok' : 'fail') : '';
    const dis = currentAction || play ? ' disabled' : '';
    const acts = [];
    acts.push(`<button type="button" class="btn small primary" data-run="${s.id}"${dis}>Run</button>`);
    if (s.agent) acts.push(`<button type="button" class="btn small" data-run="${s.id}" data-opt="recorded"${dis} title="Live mode only: skip the agent and apply its change from the lab">Recorded</button>`);
    return `<div class="step ${cls} ${selected === s.id ? 'sel' : ''}" data-step="${s.id}" title="${esc(s.what || '')}">
      <span class="num">${isExtra ? '•' : s.n}</span>
      <span class="t">${esc(s.short || s.title)}${s.agent ? '<span class="tag">agent</span>' : ''}</span>
      <span class="acts">${acts.join('')}</span></div>`;
  }
  function drawSteps() {
    document.getElementById('steps').innerHTML = META.steps.map((s) => stepCard(s)).join('');
    const checks = META.checks.map((c) => `<button type="button" class="btn small" data-run="${c.id}"${currentAction || play ? ' disabled' : ''} title="${esc(c.title)}">${esc(c.short || c.title)}</button>`).join(' ');
    const extras = META.extras.map((s) => `<button type="button" class="btn small" data-run="${s.id}"${currentAction || play ? ' disabled' : ''} title="${esc(s.what || s.confirm || '')}">${esc(s.short || s.title)}</button>`).join(' ');
    document.getElementById('extras').innerHTML = checks + extras;
    bind();
    fitResult();
  }
  function bind() {
    document.querySelectorAll('[data-step]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selected = el.dataset.step; view = 'step'; drawSteps(); drawMapping();
    }));
    document.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.run;
      const def = [...META.steps, ...META.extras].find((s) => s.id === id);
      if (def) { selected = id; view = 'step'; drawMapping(); }
      if (def && def.confirm && Console.getMode() === 'live' && !window.confirm(def.confirm)) return;
      if (b.dataset.opt === 'recorded' && Console.getMode() === 'replay') { Console.addLine('note', 'In replay mode the whole step is the recording: use Run.'); return; }
      Console.run(id, b.dataset.opt === 'recorded' ? { recorded: true } : {});
    }));
  }

  // ---------- mapping ----------
  const BIG = `<p class="maptitle">Where this goes</p>
    <p class="what just">My lab is the software lifecycle run once, by hand: plan, code, build, test, release, deploy, operate, with something coming in from outside at each phase. CI/CD is that loop automated, and Chainguard supplies its inputs already clean and keeps them current.</p>
    <div class="map">
      <div class="lab"><h3>Coding agents</h3><p>Agents turn the loop faster than people can review, so trust has to come from the source and the sandbox: what the agent may run, where, and what checks its work before a person merges.</p></div>
      <div class="ent"><h3>Enterprise CI</h3><p>Ephemeral runners, required checks, keyless signing with the pipeline's identity, SBOM and provenance as signed attestations, GitOps deploys and admission policies.</p></div>
      <div class="cg"><h3>Chainguard</h3><p>Its newest products follow the logic of this pipeline: pin it, verify it, sign the result, and test the thing that actually runs. Actions and the MCP servers are generally available; Workspaces, Checks and Agent Skills are in beta, Technology Previews under Chainguard\'s terms; Harness is a beta by waitlist. Say which when you name them; the Chainguard switch on the diagram shows where each one fits.</p></div>
      <div class="ai"><h3>AI factories</h3><p>Under the models, an AI factory's software is containers on Kubernetes: GPU operators, model servers, gateways. The questions are the ones this demo answers: who supplies each image, how old it is, which user it runs as, and what proves where it came from.</p></div>
    </div>`;
  function drawMapping() {
    const s = [...META.steps, ...META.extras].find((x) => x.id === selected);
    const el = document.getElementById('mapping');
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'big') { el.innerHTML = BIG; return; }
    if (!s || !s.lab) { el.innerHTML = '<p class="empty">Select a step to see what it does in the lab, in an enterprise pipeline, with Chainguard, and for AI.</p>'; return; }
    el.innerHTML = `<p class="maptitle">${s.n != null ? `Step ${s.n} · ` : ''}${esc(s.title)}</p><p class="what just">${esc(s.what)}</p>
      <div class="map">
        <div class="lab"><h3>In the lab</h3><p>${esc(s.lab)}</p></div>
        <div class="ent"><h3>In an enterprise pipeline</h3><p>${esc(s.enterprise)}</p></div>
        <div class="cg"><h3>Chainguard</h3><p>${esc(s.chainguard)}</p></div>
        <div class="ai"><h3>Agents and AI</h3><p>${esc(s.ai)}</p></div>
      </div>`;
    if (s.nodes) highlight(s.nodes, s.edges);
  }

  // ---------- checks ----------
  function drawChips() {
    const c = STATE.checks || {};
    const order = [['vms', 'VMs'], ['gh', 'gh'], ['runner', 'runner'], ['policy', 'policy'], ['app', 'app'], ['db', 'Grype DB'], ['clone', 'clone'], ['agent', 'agent']];
    const short = { gh: (v) => v.text.replace('gh account: ', 'gh: '), app: (v) => v.text.replace('hello-ai ready: ', 'app ') };
    const chips = order.map(([k, label]) => { const v = c[k]; const txt = v ? (short[k] ? short[k](v) : label) : label; return `<span class="chip ${v ? (v.ok ? 'ok' : 'bad') : ''}" title="${esc(v ? v.text : 'not checked yet: Run the checks')}">${esc(txt)}</span>`; }).join('');
    const pr = STATE.pr ? `<span class="chip">PR #${STATE.pr}</span>` : '';
    document.getElementById('chips').innerHTML = chips + pr;
  }

  // ---------- events ----------
  Console.on((ev) => {
    if (ev.t === 'hello') currentAction = ev.busy ? ev.busy.action : null;
    if (ev.t === 'hello' || ev.t === 'state') { STATE = ev.state || {}; drawChips(); if (META) drawSteps(); }
    if (ev.t === 'start') {
      currentAction = ev.action;
      document.querySelectorAll(`.step[data-step="${ev.action}"]`).forEach((el) => { el.classList.remove('ok', 'fail'); el.classList.add('running'); });
      if (GATE_ACTIONS.test(ev.action)) chips(':not([data-chip^="d-"]):not([data-chip^="s-"])', 'run');
      if (ev.action === 'ci-merge') chips('[data-chip^="d-"]', 'run');
      if (ev.action === 'ci-skill-gate') chips('[data-chip^="s-"]', 'run');
      if (ev.action === 'ci-chainguard') setCgView(true); else if (!Console.isPresent(ev.action)) setCgView(false);
      if (ev.action === 'ci-branch' || ev.action === 'ci-cleanup') {   // the run starts again without the skill
        chips('[data-chip^="s-"]', null);
        const n = document.querySelector('.diagram .node[data-id="mac-skill"]'); if (n) n.classList.remove('good', 'badn', 'seen', 'hot');
      }
    }
    if (ev.t === 'stage') highlight(ev.nodes, ev.edges);
    if (ev.t === 'line' && currentAction && !Console.isPresent(currentAction) && typeof ev.s === 'string') chipsFromLine(ev.s);
    if (ev.t === 'end') chips('.run', 'skip');   // a check that never ran, e.g. after the build failed
    if (ev.t === 'cleared') chips('', null);
    if (ev.t === 'start') lastOwn = null;
    if (ev.t === 'result' && !(currentAction && Console.isPresent(currentAction))) { resultTitle(ev); lastOwn = ev; }
    if (ev.t === 'result' && currentAction && !Console.isPresent(currentAction)) {
      if (/gate/.test(currentAction)) { mark('vm-gate', ev.status === 'pass'); mark('gh-check', ev.status === 'pass'); }
      if (currentAction === 'ci-unsigned') mark('k8s-refused', ev.status === 'pass');
      if (currentAction === 'ci-skill-gate') mark('mac-skill', ev.status === 'pass');
      if (currentAction === 'ci-merge' || currentAction === 'ci-cluster' || currentAction === 'ci-call') mark('k8s-pods', ev.status === 'pass');
    }
    if (ev.t === 'end') currentAction = null;
    if (ev.t === 'end') document.querySelectorAll(`.step[data-step="${ev.action}"]`).forEach((el) => { el.classList.remove('running'); el.classList.add(ev.ok ? 'ok' : 'fail'); });
    if (ev.t === 'end' && play && ev.action === play.current && !Console.syncing()) afterStep(ev);   // never on replayed history
    if (play) document.querySelectorAll('#steps [data-run], #extras [data-run]').forEach((b) => { b.disabled = true; });   // Play owns the buttons
    if (ev.t === 'hello' || ev.t === 'start' || ev.t === 'end') playUI();
  });

  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; drawMapping(); }));
  document.getElementById('cgback').addEventListener('click', () => setCgView(false));
  // each folding section stays open or closed across reloads (this browser only);
  // opening one by hand brings it into the step panel's view, closing it brings the steps back
  document.querySelectorAll('details.fold').forEach((d) => {
    const key = 'ci-' + d.id;
    try { const v = localStorage.getItem(key); if (v !== null) d.open = v === '1'; } catch {}
    d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch {} });
    d.querySelector('summary').addEventListener('click', () => setTimeout(() => { if (d.open) d.scrollIntoView({ block: 'nearest' }); }, 0));
  });
  // the result card takes whatever height the step column has left, and scrolls inside, so the column itself never has to
  const side = document.querySelector('aside .card');
  const STACKED = window.matchMedia('(max-width: 1100px), (max-height: 620px)');   // same query as style.css
  function fitResult() {
    const res = document.getElementById('result');
    res.style.maxHeight = 'none';
    if (!document.getElementById('fold-result').open || STACKED.matches) return;   // stacked layout: the page scrolls instead
    const over = side.scrollHeight - side.clientHeight;
    if (over > 0) res.style.maxHeight = Math.max(90, res.offsetHeight - over) + 'px';
  }
  document.querySelectorAll('details.fold').forEach((d) => d.addEventListener('toggle', fitResult));
  window.addEventListener('resize', fitResult);
  // with the result folded away, its title and outcome stay visible on the fold's own line
  function resultTitle(ev) {
    const el = document.getElementById('rtitle');
    el.className = 'rtitle ' + (ev.status || 'info');
    el.textContent = ev.title || '';
    fitResult();
  }

  // ---------- Play: every step in order, hands-off, in the current mode ----------
  // Live mode runs the checks first. Play stops at the first failed step, stops before the merge if the gate is
  // still red after the agent's fix, and skips the skill gate and the fix (steps 4 to 7) if the gate passes first time.
  const PLAY_GAP = 2500;                                   // a pause between steps, to see each result
  const FIX_STEPS = ['ci-skill-gate', 'ci-agent-fix', 'ci-push-fix', 'ci-gate-2'];
  const $ = (id) => document.getElementById(id);
  const stepTitle = (id) => { const d = [...META.steps, ...META.checks].find((x) => x.id === id); return d ? (d.short || d.title) : id; };
  function playUI() {
    const on = !!play;
    $('play').hidden = on; $('pause').hidden = !on; $('playstop').hidden = !on;
    $('play').disabled = !!currentAction;
    if (on) $('pause').textContent = play.paused ? 'Resume' : 'Pause';
    const st = $('playstat');
    st.className = 'playstat' + (on ? ' on' : '');
    st.textContent = on ? `${play.paused ? 'paused' : 'playing'} ${play.n}/${play.n + play.queue.length}` + (play.current ? ` · ${stepTitle(play.current)}` : '') : '';
  }
  function startPlay(agent) {
    const mode = Console.getMode();
    const queue = (mode === 'live' ? ['preflight'] : []).concat(META.steps.map((s) => s.id));
    play = { queue, n: 0, agent, mode, paused: false, current: null, timer: null };
    Console.addLine('note', `▶ Play: ${queue.length} steps in ${mode} mode` + (mode === 'live' ? `; agent steps: ${agent === 'recorded' ? 'its recorded change' : 'the agent runs live'}` : '; the recorded lab run'));
    drawSteps(); next();
  }
  function next() {
    if (!play) return;
    play.timer = null;
    if (play.paused) { playUI(); return; }
    const id = play.queue.shift();
    if (!id) { endPlay('■ Play finished: every step ran.', 'ok'); return; }
    play.n += 1; play.current = id;
    const def = META.steps.find((s) => s.id === id);
    if (def) { selected = id; view = 'step'; drawSteps(); drawMapping(); }
    const opt = def && def.agent && play.mode === 'live' && play.agent === 'recorded' ? { recorded: true } : {};
    playUI();
    Console.run(id, opt).then((started) => { if (!started && play) endPlay(`■ Play stopped: "${stepTitle(id)}" could not start.`, 'fail'); });
  }
  function afterStep(ev) {
    const id = play.current; play.current = null;
    if (!ev.ok) { endPlay(`■ Play stopped: "${stepTitle(id)}" failed. Fix it, then carry on by hand or press Play again.`, 'fail'); return; }
    if (id === 'preflight' && lastOwn && lastOwn.status === 'fail') { endPlay(`■ Play stopped: ${lastOwn.title} (see Last result).`, 'fail'); return; }
    if (play.mode === 'live' && id === 'ci-gate' && STATE.lastGate && STATE.lastGate.pass) {
      play.queue = play.queue.filter((x) => !FIX_STEPS.includes(x));
      Console.addLine('note', 'The gate passed first time, so the agent has nothing to fix: Play skips steps 4 to 7 and goes on to the merge.');
    }
    if (play.mode === 'live' && id === 'ci-gate-2' && STATE.lastGate && !STATE.lastGate.pass) { endPlay('■ Play stopped before the merge: the gate is still red after the agent\'s fix.', 'fail'); return; }
    play.timer = setTimeout(next, PLAY_GAP);
  }
  function endPlay(msg, kind) {
    if (!play) return;
    clearTimeout(play.timer); play = null;
    Console.addLine(kind || 'note', msg);
    playUI(); drawSteps();
  }
  $('play').addEventListener('click', () => {
    if (currentAction || play) return;
    if (Console.getMode() === 'replay') { startPlay('recorded'); return; }
    const dlg = $('playdlg');
    dlg.returnValue = '';
    dlg.addEventListener('close', () => { if (dlg.returnValue === 'live' || dlg.returnValue === 'recorded') startPlay(dlg.returnValue); }, { once: true });
    dlg.showModal();
  });
  $('pause').addEventListener('click', () => {
    if (!play) return;
    play.paused = !play.paused;
    Console.addLine('note', play.paused ? '⏸ Play paused: it holds before the next step.' : '▶ Play resumed.');
    if (!play.paused && !play.current && !play.timer) next();
    playUI();
  });
  $('playstop').addEventListener('click', () => {
    if (!play) return;
    const running = !!currentAction;
    endPlay('■ Play stopped by the operator.', 'fail');
    if (running) Console.stop();
  });

  // ---------- hide the step list, so the diagram and the terminal use the full width ----------
  function setStepsHidden(h) {
    document.body.classList.toggle('steps-hidden', h);
    $('togglesteps').setAttribute('aria-pressed', String(h));
    $('togglesteps').textContent = h ? 'Show steps' : 'Hide steps';
    try { localStorage.setItem('ci-steps-hidden', h ? '1' : '0'); } catch {}
    fitResult();
  }
  $('togglesteps').addEventListener('click', () => setStepsHidden(!document.body.classList.contains('steps-hidden')));
  try { if (localStorage.getItem('ci-steps-hidden') === '1') setStepsHidden(true); } catch {}

  fetch('/api/meta').then((r) => r.json()).then((m) => {
    META = m.ci;
    drawDiagram(); drawSteps(); drawMapping(); drawChips();
    Console.init();
  });
})();
