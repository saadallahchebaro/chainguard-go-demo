// demo/console/public/common.js: what both pages share. The event stream from the server, the terminal panel,
// the result card, the Live/Replay switch and the run/stop calls.
'use strict';
(function () {
  const TOKEN = document.querySelector('meta[name="console-token"]').content;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const listeners = [];
  let busy = null, startedAt = 0, timer = null;

  // ---------- mode ----------
  const getMode = () => { try { return localStorage.getItem('console-mode') || 'live'; } catch { return 'live'; } };
  function setMode(m) {
    try { localStorage.setItem('console-mode', m); } catch {}
    document.querySelectorAll('.mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    document.body.dataset.mode = m;
  }

  // ---------- terminal ----------
  const body = () => document.getElementById('termbody');
  let stick = true;
  function addLine(k, s) {
    const el = body(); if (!el) return;
    const span = document.createElement('span');
    span.className = 'ln ' + (k || 'out');
    span.textContent = s === '' ? ' ' : s;
    el.appendChild(span);
    while (el.childNodes.length > 5000) el.removeChild(el.firstChild);
    if (stick) el.scrollTop = el.scrollHeight;
  }
  function sep(text) { const el = body(); if (!el) return; const d = document.createElement('span'); d.className = 'ln sep'; d.textContent = text; el.appendChild(d); if (stick) el.scrollTop = el.scrollHeight; }

  // ---------- result card ----------
  function renderResult(r) {
    const box = document.getElementById('result'); if (!box) return;
    box.classList.remove('pass', 'fail', 'info'); box.classList.add(r.status || 'info');   // keep the page's own layout classes
    let h = `<h3>${esc(r.title || '')}</h3>`;
    if (r.rows && r.rows.length) {
      h += '<table>' + r.rows.map((row) => `<tr>${row.map((c, i) => `<td class="${i === 0 ? esc(String(c)[0]) : ''}">${esc(c)}</td>`).join('')}</tr>`).join('') + '</table>';
    }
    if (r.lines && r.lines.length) h += '<ul>' + r.lines.filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('') + '</ul>';
    if (r.images && r.images.length) h += '<div class="imgs">' + r.images.map((src) => `<img src="${esc(src)}" alt="Screenshot from the lab: ${esc(src.split('/').pop())}" loading="lazy">`).join('') + '</div>';
    if (r.link && /^https:\/\/github\.com\//.test(r.link)) h += `<p><a href="${esc(r.link)}" target="_blank" rel="noopener">Open on GitHub</a></p>`;
    box.innerHTML = h;
    box.querySelectorAll('img').forEach((img) => img.addEventListener('click', () => {
      const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(img.src)}" alt="">`;
      lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb);
    }));
  }

  // ---------- status ----------
  function setBusy(b, title) {
    busy = b;
    const now = document.getElementById('now'), dot = document.getElementById('livedot');
    if (dot) dot.classList.toggle('on', !!b);
    clearInterval(timer);
    if (b) {
      startedAt = Date.now();
      const tick = () => { if (now) now.textContent = `${title}  ·  ${Math.round((Date.now() - startedAt) / 1000)} s`; };
      tick(); timer = setInterval(tick, 1000);
    } else if (now) now.textContent = title || 'idle';
    document.querySelectorAll('[data-run]').forEach((el) => { el.disabled = !!b; });
    const stop = document.getElementById('stop'); if (stop) stop.disabled = !b;
  }

  // ---------- server calls ----------
  async function post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Console-Token': TOKEN }, body: JSON.stringify(data || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  async function run(action, opt) {   // true once the server has started it
    try { await post('/api/run', { action, mode: getMode(), opt: opt || {} }); return true; }
    catch (e) { addLine('fail', `could not start ${action}: ${e.message}`); return false; }
  }
  const stop = () => post('/api/stop').catch(() => {});

  // ---------- events ----------
  // Both pages share one server, so each result card shows only its own page's actions:
  // the presentation proofs are the p-* actions, everything else belongs to the CI page.
  let runAction = null;
  const isPresent = (a) => /^[pq]-/.test(a || '');   // p-: the presentation proofs, q-: its quick answers
  const ownResult = (a) => {
    const page = document.body.dataset.page;
    if (!a || !page) return true;
    return page === 'present' ? isPresent(a) : !isPresent(a);
  };
  // The connection: the server replays its recent history to every page that connects, then marks the end of it with
  // 'synced'. A reconnect clears the terminal first, so the replay doesn't duplicate it. If the server was restarted, it
  // refuses this page's old token: the page waits until the server answers, then reloads itself to get the new one.
  let everConnected = false, syncing = true;
  function connect() {
    const es = new EventSource(`/api/events?token=${encodeURIComponent(TOKEN)}`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.t === 'hello') {
        if (everConnected) { const el = body(); if (el) el.innerHTML = ''; }
        everConnected = true; syncing = true;
        runAction = ev.busy ? ev.busy.action : null; setBusy(ev.busy, ev.busy ? ev.busy.action : 'idle');
      }
      if (ev.t === 'synced') syncing = false;
      if (ev.t === 'start') { runAction = ev.action; sep(`── ${ev.title}  [${ev.mode}]  ${new Date(ev.ts).toLocaleTimeString()}`); setBusy(true, ev.title); }
      if (ev.t === 'line') addLine(ev.k, ev.s);
      if (ev.t === 'result' && ownResult(runAction)) renderResult(ev);
      if (ev.t === 'end') { addLine(ev.ok ? 'ok' : 'fail', `${ev.ok ? '✔ done' : '✖ failed'} in ${Math.round(ev.ms / 100) / 10} s`); setBusy(false, `last: ${ev.action} ${ev.ok ? 'done' : 'failed'}`); }
      if (ev.t === 'cleared') { const el = body(); if (el) el.innerHTML = ''; }
      listeners.forEach((f) => f(ev));
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) { es.close(); recover(); }   // refused: a restarted server, with a new token
      else setBusy(!!runAction, 'reconnecting…');                           // dropped: the browser retries by itself
    };
  }
  function recover() {
    setBusy(false, 'disconnected: waiting for the server…');
    const again = async () => {
      try { const r = await fetch('/api/state', { cache: 'no-store' }); if (r.ok) { location.reload(); return; } } catch {}
      setTimeout(again, 2500);
    };
    setTimeout(again, 1500);
  }

  function init() {
    setMode(getMode());
    document.querySelectorAll('.mode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    const el = body();
    if (el) el.addEventListener('scroll', () => { stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30; });
    const st = document.getElementById('stop'); if (st) st.addEventListener('click', stop);
    const cl = document.getElementById('clear'); if (cl) cl.addEventListener('click', () => { if (body()) body().innerHTML = ''; });
    connect();
  }

  window.Console = { init, run, stop, post, on: (f) => listeners.push(f), esc, getMode, renderResult, addLine, isPresent, syncing: () => syncing };
})();
