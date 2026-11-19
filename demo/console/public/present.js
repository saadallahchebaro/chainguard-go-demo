// demo/console/public/present.js: the presentation page. One section per part of the deck, each with its proofs.
'use strict';
(function () {
  const { esc } = Console;
  let META = null, cur = null, STATE = {}, busy = null, queue = [], filter = '';
  let qgroup = (() => { try { return localStorage.getItem('present-qgroup') || ''; } catch { return ''; } })();

  const sectionFromHash = () => (location.hash || '').slice(1);

  function drawToc() {
    document.getElementById('toc').innerHTML = META.sections.map((s) =>
      `<button type="button" data-sec="${s.id}" aria-current="${s.id === cur}"><span class="sl">${s.id === 'ask' ? 'Q&amp;A' : s.id === 'cg' ? 'map' : 'slide ' + esc(s.slides)}</span><span>${esc(s.title)}</span></button>`).join('');
    document.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => { cur = b.dataset.sec; history.replaceState(null, '', '#' + cur); drawToc(); drawSection(); }));
  }

  function drawSection() {
    const s = META.sections.find((x) => x.id === cur) || META.sections[0];
    const st = STATE.steps || {};
    document.body.classList.toggle('ask', s.id === 'ask' || s.id === 'cg');   // quick answers and the Chainguard map take the full width
    document.body.classList.toggle('cgmap', s.id === 'cg');                   // the map needs no terminal: nothing runs
    let h = (s.id === 'ask' || s.id === 'cg') ? `<div class="askhead"><h2>${esc(s.title)}</h2><span class="claim">${esc(s.claim)}</span>${s.id === 'ask' ? `<input type="search" class="qfilter" id="qfilter" placeholder="Filter: dockerfile, digest, registry, sbom, policy…" aria-label="Filter the quick answers" value="${esc(filter)}">` : ''}</div>`
      : `<h2>${esc(s.title)}</h2><p class="slides">deck slide ${esc(s.slides)}</p><p class="claim">${esc(s.claim)}</p>`;
    if (s.link) h += `<p><a class="btn primary" href="${esc(s.link)}">Open the CI demo console</a></p>`;
    else if (s.chainguard) {
      const cg = s.chainguard;
      h += '<div class="cgtable"><span class="h">Stage</span><span class="h">Product</span><span class="h">Status</span><span class="h">What it does</span><span class="h">Where it meets this lab</span>' +
        cg.stages.map((g) => g.products.map((p, i) => `<span class="stage">${i ? '' : esc(g.stage)}</span><span class="prod"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a></span>` +
          `<span class="st ${p.shortStatus === 'GA' ? 'ga' : ''}" title="${esc(p.status)}">${esc(p.cell)}</span><span>${esc(p.what)}</span><span>${esc(p.lab)}</span>`).join('')).join('') + '</div>' +
        `<p class="cgnote">${esc(cg.NOT_CHAINGUARD)} Statuses from chainguard.dev and its docs, checked on ${esc(cg.CHECKED)}; check them again before the panel. On the CI demo page, the Chainguard switch puts the same products on the pipeline diagram.</p>`;
    }
    else if (s.shortcuts) {
      // one tab per group; typing in the filter searches every group at once
      const btn = (it) => { const r = st[it.id]; return `<button type="button" class="btn small q ${r ? (r.ok ? 'ok' : 'fail') : ''}" data-run="${it.id}"${busy ? ' disabled' : ''}>${esc(it.title)}</button>`; };
      if (!s.shortcuts.some((g) => g.group === qgroup)) qgroup = s.shortcuts[0].group;
      h += '<div class="qtabs" role="tablist">' + s.shortcuts.map((g) => `<button type="button" role="tab" class="qtab" data-qgroup="${esc(g.group)}" aria-selected="${!filter && g.group === qgroup}">${esc(g.group)} <span>${g.items.length}</span></button>`).join('') + '</div>';
      if (filter) {
        h += s.shortcuts.map((g) => {
          const items = g.items.filter((it) => (g.group + ' ' + it.title).toLowerCase().includes(filter.toLowerCase()));
          return items.length ? `<div class="qgroup"><h3>${esc(g.group)}</h3><div class="qbtns">${items.map(btn).join('')}</div></div>` : '';
        }).join('') || '<p class="empty">Nothing matches that filter.</p>';
      } else {
        const g = s.shortcuts.find((x) => x.group === qgroup);
        h += `<div class="qbtns qone">${g.items.map(btn).join('')}</div>`;
      }
    } else {
      h += '<div class="proofs">' + s.actions.map((id) => {
        const a = META.actions[id]; const r = st[id];
        return `<div class="proof ${r ? (r.ok ? 'ok' : 'fail') : ''}"><span class="pt">${esc(a.title)}</span><button type="button" class="btn small primary" data-run="${id}"${busy ? ' disabled' : ''}>Run</button></div>`;
      }).join('') + '</div>';
    }
    document.getElementById('sec').innerHTML = h;
    document.querySelectorAll('#sec [data-qgroup]').forEach((t) => t.addEventListener('click', () => {
      qgroup = t.dataset.qgroup; filter = ''; try { localStorage.setItem('present-qgroup', qgroup); } catch {} drawSection();
    }));
    const qf = document.getElementById('qfilter');
    if (qf) qf.addEventListener('input', () => { filter = qf.value; drawSection(); const f = document.getElementById('qfilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); });
    document.querySelectorAll('#sec [data-run]').forEach((b) => b.addEventListener('click', () => Console.run(b.dataset.run)));
    document.getElementById('runall').disabled = !!busy || !s.actions;
  }

  document.getElementById('runall').addEventListener('click', () => {
    const s = META.sections.find((x) => x.id === cur);
    if (!s || !s.actions) return;
    queue = s.actions.slice();
    Console.run(queue.shift());
  });

  Console.on((ev) => {
    if (ev.t === 'hello') busy = ev.busy;
    if (ev.t === 'hello' || ev.t === 'state') { STATE = ev.state || {}; if (META) drawSection(); }
    if (ev.t === 'start') { busy = { action: ev.action }; if (META) drawSection(); }
    if (ev.t === 'end') {
      busy = null;
      if (queue.length) setTimeout(() => Console.run(queue.shift()), 400);
      if (META) drawSection();
    }
  });

  window.addEventListener('hashchange', () => {
    if (META && META.sections.some((s) => s.id === sectionFromHash())) { cur = sectionFromHash(); drawToc(); drawSection(); }
  });

  fetch('/api/meta').then((r) => r.json()).then((m) => {
    META = m.present;
    cur = META.sections.some((s) => s.id === sectionFromHash()) ? sectionFromHash() : META.sections[0].id;
    drawToc(); drawSection();
    Console.init();
  });
})();
