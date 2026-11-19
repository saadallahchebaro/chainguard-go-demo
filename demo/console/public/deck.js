// demo/console/public/deck.js: the command deck page. It lists the terminals the server can type into, and sends a
// command by its id; the server holds the commands, so nothing typed here is ever run.
'use strict';
(function () {
  const TOKEN = document.querySelector('meta[name="console-token"]').content;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let META = null, filter = '';
  const sentIds = new Set();

  async function post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Console-Token': TOKEN }, body: JSON.stringify(data || {}) });
    if (r.status === 403) { setTimeout(() => location.reload(), 1200); throw new Error('the server was restarted: reloading this page'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  function drawTargets(d) {
    const sel = $('target'), keep = store.get('deck-target', '');
    sel.innerHTML = d.list.length ? d.list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('') : '<option value="">No terminal found: create the "show" session, or open Terminal</option>';
    const pick = d.list.some((t) => t.id === keep) ? keep : d.preferred;
    if (pick) sel.value = pick;
    $('notes').textContent = d.notes.join(' · ');
    $('attach').textContent = d.attach;
  }

  function drawGroups() {
    const f = filter.toLowerCase();
    const html = META.groups.map((g) => {
      const items = g.items.filter((it) => !f || `${g.group} ${it.title} ${it.cmd}`.toLowerCase().includes(f));
      if (!items.length) return '';
      return `<div class="qgroup"><h3>${esc(g.group)}</h3><div class="qbtns">` + items.map((it) =>
        `<button type="button" class="btn small q ${sentIds.has(it.id) ? 'ok' : ''}" data-id="${esc(it.id)}"${it.on !== 'vm' ? ' disabled title="Runs on the k3s VM: use the presentation page"' : ''}${it.deckOnly ? (it.kind === 'interactive' ? ' title="Opens a shell in the terminal: type exit there to leave"' : ' title="Asks for a password in the terminal: type it there"') : ''}>${esc(it.title)}${it.deckOnly ? (it.kind === 'interactive' ? ' ⌨' : ' 🔑') : ''}</button>`).join('') + '</div></div>';
    }).join('');
    $('groups').innerHTML = html || '<p class="empty">Nothing matches that filter.</p>';
    const byId = Object.fromEntries(META.groups.flatMap((g) => g.items.map((it) => [it.id, it])));
    document.querySelectorAll('#groups [data-id]').forEach((b) => {
      const it = byId[b.dataset.id];
      b.addEventListener('mouseenter', () => { $('preview').textContent = it.cmd; });
      b.addEventListener('focus', () => { $('preview').textContent = it.cmd; });
      b.addEventListener('click', () => sendOne(it));
    });
  }

  async function sendOne(it) {
    const target = $('target').value;
    if (!target) { status('Pick a terminal first: create the "show" session, then open it on the shared screen.', 'fail'); return; }
    status(`sending: ${it.title} …`, '');
    try {
      const r = await post('/api/deck/send', { target, id: it.id, enter: $('enter').checked });
      sentIds.add(it.id); drawGroups();
      status(`${$('enter').checked ? 'ran' : 'typed (press Enter there)'}: ${it.title} → ${r.to}`, 'ok');
      $('preview').textContent = r.sent;
    } catch (e) { status(`not sent: ${e.message}`, 'fail'); }
  }
  function status(t, k) { const s = $('sent'); s.textContent = t; s.className = 'sent ' + (k || ''); }

  async function refresh() {
    try { const d = await (await fetch('/api/deck', { cache: 'no-store' })).json(); META = META || d; drawTargets(d); }
    catch (e) { status(`cannot reach the console server: ${e.message}`, 'fail'); }
  }

  $('target').addEventListener('change', () => store.set('deck-target', $('target').value));
  $('refresh').addEventListener('click', refresh);
  $('mksession').addEventListener('click', async () => {
    try { const d = await post('/api/deck/session', {}); drawTargets(d); status('The "show" session is ready on the build VM: open it on the shared screen with the command above.', 'ok'); }
    catch (e) { status(`could not create the session: ${e.message}`, 'fail'); }
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('attach').textContent); status('Copied: paste it into the terminal on the shared screen.', 'ok'); }
    catch { status('Copy it by hand: ' + $('attach').textContent, ''); }
  });
  $('enter').checked = store.get('deck-enter', '1') === '1';
  $('enter').addEventListener('change', () => store.set('deck-enter', $('enter').checked ? '1' : '0'));
  $('filter').addEventListener('input', () => { filter = $('filter').value; drawGroups(); });

  fetch('/api/deck', { cache: 'no-store' }).then((r) => r.json()).then((d) => { META = d; drawTargets(d); drawGroups(); });
})();
