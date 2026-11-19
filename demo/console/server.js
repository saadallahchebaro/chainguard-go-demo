#!/usr/bin/env node
// demo/console/server.js: the demo console. Serves three pages (the CI demo, the full presentation and the command deck) and runs
// a fixed set of demo actions, streaming their output to the browser as server-sent events.
// Safety: it listens on 127.0.0.1 only, every action is defined in actions/*.js (nothing typed in the browser is
// ever executed), and every request that runs something must carry the token printed at start-up.
// Run on the Mac from the lab checkout:  node demo/console/server.js   then open the URL it prints.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const DECK = require('./deck');
const CFG = require('./config');

const ACTION_MODULES = [require('./actions/ci'), require('./actions/present')];
const ACTIONS = Object.assign({}, ...ACTION_MODULES.map((m) => m.actions));
const TOKEN = crypto.randomBytes(16).toString('hex');
const PUBLIC = path.join(__dirname, 'public');

// ---------- state that survives a restart (branch, pull request, last results) ----------
let STATE = {};
try { STATE = JSON.parse(fs.readFileSync(CFG.stateFile, 'utf8')); } catch { STATE = {}; }
function saveState() {
  try { fs.writeFileSync(CFG.stateFile, JSON.stringify(STATE, null, 2)); } catch (e) { console.error('state not saved:', e.message); }
  broadcast({ t: 'state', state: STATE });
}

// ---------- server-sent events ----------
const clients = new Set();
const history = [];                                   // recent events, replayed to a page that (re)connects
function broadcast(ev) {
  ev.ts = Date.now();
  if (ev.t !== 'state' && ev.t !== 'checks') { history.push(ev); if (history.length > 4000) history.splice(0, history.length - 4000); }
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(data);
}

// ---------- running one action at a time ----------
let current = null;                                   // { id, action, mode, child, cancelled, started }
let runSeq = 0;

function cleanEnv(extra = {}) {
  // A minimal environment: the tools need HOME and PATH, nothing else from the shell that started the server
  const e = { HOME: process.env.HOME, PATH: process.env.PATH, USER: process.env.USER, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' };
  return Object.assign(e, extra);
}

function exec(run, line, label, file, args, opts = {}) {
  return new Promise((resolve) => {
    if (run.cancelled) return resolve({ code: 130, out: '', err: 'stopped' });
    if (!opts.silentCmd) line('cmd', label);
    const child = spawn(file, args, {
      cwd: opts.cwd || CFG.lab,
      env: cleanEnv(opts.env),
      detached: true,                                 // its own process group, so Stop ends everything it started
      stdio: [opts.input != null ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    run.child = child;
    let out = '', err = '', bufO = '', bufE = '';
    const emitLines = (chunk, which) => {
      let buf = (which === 'out' ? bufO : bufE) + chunk;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop();
      for (const raw of parts) {
        const l = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');   // strip terminal colour codes
        if (opts.onLine) opts.onLine(l, which);
        if (opts.quiet) continue;
        const shown = opts.filter ? opts.filter(l, which) : l;
        if (Array.isArray(shown)) line(shown[0], shown[1]);   // a filter may also choose the line's colour: [kind, text]
        else if (shown != null && shown !== false) line(which === 'err' ? (opts.errAs || 'err') : (opts.outAs || 'out'), shown);
      }
      if (which === 'out') bufO = buf; else bufE = buf;
    };
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; emitLines(s, 'out'); });
    child.stderr.on('data', (d) => { const s = d.toString(); err += s; emitLines(s, 'err'); });
    if (opts.input != null) { child.stdin.write(opts.input); child.stdin.end(); }
    let timer = null;
    if (opts.timeout) timer = setTimeout(() => { line('fail', `timed out after ${Math.round(opts.timeout / 1000)} s`); killTree(child); }, opts.timeout);
    child.on('error', (e) => { line('fail', `could not start ${file}: ${e.message}`); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (bufO) emitLines('\n', 'out');
      if (bufE) emitLines('\n', 'err');
      run.child = null;
      resolve({ code: code == null ? 1 : code, out, err });
    });
  });
}

function killTree(child) {
  if (!child || child.exitCode != null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000);
}

function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

function makeCtx(run) {
  const emit = (o) => broadcast(Object.assign({ id: run.id }, o));
  const line = (k, s) => { for (const l of String(s).replace(/\r/g, '').split('\n')) emit({ t: 'line', k, s: l }); };
  const ctx = {
    cfg: CFG, state: STATE, save: saveState, mode: run.mode, opt: run.opt || {}, shq,
    say: (s, k = 'note') => line(k, s),
    stage: (nodes, edges = []) => emit({ t: 'stage', nodes, edges }),
    result: (r) => emit(Object.assign({ t: 'result' }, r)),
    checks: (c) => { STATE.checks = Object.assign(STATE.checks || {}, c); saveState(); },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    cancelled: () => run.cancelled,
    run: (label, file, args, opts) => exec(run, line, label, file, args, opts),
    sh: (script, opts = {}) => exec(run, line, opts.label || script, '/bin/bash', ['-c', script], opts),
    // Go and govulncheck live in /usr/local/go/bin and ~/go/bin, which a non-interactive shell doesn't add to PATH
    vm: (script, opts = {}) => exec(run, line, opts.label || script, 'multipass', ['exec', CFG.vm, '--', 'bash', '-lc', `export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"; ${script}`], opts),
    gh: (args, opts = {}) => exec(run, line, opts.label || `gh ${args.join(' ')}`, 'gh', args, opts),
    git: (args, opts = {}) => exec(run, line, opts.label || `git ${args.join(' ')}`, 'git', args, Object.assign({ cwd: CFG.helloAi }, opts)),
    agent: (prompt, tools, cwd) => runAgent(run, line, prompt, tools, cwd),
  };
  return ctx;
}

// The coding agent, headless: its own output format is a stream of JSON events, shown here as they arrive
const AGENT_DENY = 'Bash(git:*),Bash(/usr/bin/git:*)';
function runAgent(run, line, prompt, tools, cwd) {
  const shortTool = (c) => {
    const i = c.input || {};
    if (c.name === 'Bash') return `$ ${i.command}`;
    if (c.name === 'Skill') return `skill ${i.skill || i.name || ''}`;
    if (i.file_path) return `${c.name.toLowerCase()} ${path.relative(cwd, i.file_path) || i.file_path}`;
    if (i.pattern) return `${c.name.toLowerCase()} ${i.pattern}`;
    return c.name;
  };
  line('cmd', `${CFG.agentLabel} (headless): ${prompt.length > 160 ? prompt.slice(0, 157) + '…' : prompt}`);
  line('note', `allowed tools: ${tools}`);
  line('note', `denied: ${AGENT_DENY} (git, read-only included)`);
  let final = '', failed = false;
  // --setting-sources project,local: the agent ignores the user's own settings, plugins and skills, so the only skills
  // it can load are the project's (the one the skill gate installed) and the ones built into the agent's tool itself.
  // --disallowedTools: git is denied outright. The agent's tool approves read-only commands on its own, so without this
  // the agent could read earlier fixes from the history with git show (JOURNAL surprise 50); a deny beats that approval.
  return exec(run, line, '', CFG.agentBin, ['-p', '--setting-sources', 'project,local', '--output-format', 'stream-json', '--verbose',
    '--allowedTools', tools, '--disallowedTools', AGENT_DENY], {
    cwd, input: prompt, silentCmd: true, quiet: true, timeout: 600000,
    onLine: (l, which) => {
      if (which === 'err') { if (l.trim()) line('dim', l); return; }
      let ev; try { ev = JSON.parse(l); } catch { if (l.trim()) line('dim', l); return; }
      if (ev.type === 'system' && ev.subtype === 'init') line('note', `${CFG.agentLabel} session started in ${cwd}`);
      else if (ev.type === 'assistant') {
        for (const c of (ev.message && ev.message.content) || []) {
          if (c.type === 'text' && c.text.trim()) line('agent', c.text.trim());
          else if (c.type === 'tool_use') line('tool', shortTool(c));
        }
      } else if (ev.type === 'user') {
        for (const c of (ev.message && ev.message.content) || []) {
          if (c.type !== 'tool_result') continue;
          const txt = Array.isArray(c.content) ? c.content.map((x) => x.text || '').join('\n') : String(c.content || '');
          const ls = txt.split('\n').filter((x) => x.trim());
          if (ls.length) line(c.is_error ? 'err' : 'dim', ls.slice(0, 8).join('\n') + (ls.length > 8 ? `\n… ${ls.length - 8} more lines` : ''));
        }
      } else if (ev.type === 'result') {
        failed = !!ev.is_error;
        final = ev.result || '';
        line(failed ? 'fail' : 'ok', `${CFG.agentLabel} finished in ${Math.round((ev.duration_ms || 0) / 1000)} s`);
        const denied = (ev.permission_denials || []).length;
        if (denied) line('note', `${denied} tool request(s) outside the allowlist were refused`);
      }
    },
  }).then((r) => Object.assign(r, { final, failed: failed || r.code !== 0 }));
}

// Replay: the recorded lab run, played back with the same events the live run produces
async function replay(ctx, script) {
  for (const step of script) {
    if (ctx.cancelled()) return;
    const [k, v] = step;
    if (k === 'stage') ctx.stage(v[0] || v, v[1] || []);
    else if (k === 'result') ctx.result(v);
    else if (k === 'sleep') await ctx.sleep(v);
    else { ctx.say(v, k); await ctx.sleep(k === 'cmd' ? 500 : k === 'agent' ? 220 : 45); }
  }
}

async function startAction(name, mode, opt) {
  const def = ACTIONS[name];
  if (!def) throw Object.assign(new Error('unknown action'), { status: 404 });
  if (current) throw Object.assign(new Error(`busy: ${current.action} is running`), { status: 409 });
  const run = { id: ++runSeq, action: name, mode: mode === 'replay' ? 'replay' : 'live', opt, cancelled: false, started: Date.now() };
  current = run;
  const ctx = makeCtx(run);
  broadcast({ t: 'start', id: run.id, action: name, title: def.title, mode: run.mode });
  (async () => {
    let ok = false;
    try {
      if (run.mode === 'replay' && def.replay) {
        ctx.say('Replay: the recorded lab run of 16 November 2026 (logs/ and ci/agent-runs/); nothing is executed.', 'note');
        await replay(ctx, typeof def.replay === 'function' ? def.replay(ctx) : def.replay); ok = true;
      } else if (run.mode === 'replay' && def.shots) {
        ctx.say('Replay: the lab\'s own screenshot of this check, taken on 16 November 2026; nothing is executed.', 'note');
        ctx.result({ status: 'info', title: `${def.title} (recorded)`, images: def.shots.map((s) => `/shots/${s}`) });
        ok = true;
      } else {
        if (run.mode === 'replay') ctx.say('This step only reads state, so it runs live even in replay mode.', 'note');
        ok = (await def.live(ctx)) !== false;
      }
    } catch (e) {
      ctx.say(`stopped: ${e.message}`, 'fail');
      ok = false;
    }
    if (run.cancelled) { ctx.say('stopped by the operator', 'fail'); ok = false; }
    broadcast({ t: 'end', id: run.id, action: name, ok, ms: Date.now() - run.started });
    STATE.steps = STATE.steps || {};
    STATE.steps[name] = { ok, at: new Date().toISOString(), mode: run.mode };
    current = null;
    saveState();
  })();
  return run.id;
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || o === `http://127.0.0.1:${CFG.port}` || o === `http://localhost:${CFG.port}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 10000) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}

function page(file) {
  return fs.readFileSync(path.join(PUBLIC, file), 'utf8').replace(/__TOKEN__/g, TOKEN);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${CFG.port}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/ci')) return send(res, 200, page('index.html'), TYPES['.html']);
    if (req.method === 'GET' && url.pathname === '/present') return send(res, 200, page('present.html'), TYPES['.html']);
    if (req.method === 'GET' && url.pathname === '/deck') return send(res, 200, page('deck.html'), TYPES['.html']);
    // the command deck: list the terminals it can type into, and type one fixed command into one of them
    if (req.method === 'GET' && url.pathname === '/api/deck') return send(res, 200, Object.assign({}, DECK.meta, await DECK.targets()));
    if (req.method === 'POST' && (url.pathname === '/api/deck/send' || url.pathname === '/api/deck/session')) {
      if (req.headers['x-console-token'] !== TOKEN || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (url.pathname === '/api/deck/session') return send(res, (await DECK.ensureSession()) ? 200 : 500, Object.assign({}, await DECK.targets()));
      try { return send(res, 200, await DECK.send(String(body.target || ''), String(body.id || ''), body.enter !== false)); }
      catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/static/')) {
      const f = path.normalize(path.join(PUBLIC, url.pathname.slice(8)));
      if (!f.startsWith(PUBLIC) || !TYPES[path.extname(f)] || !fs.existsSync(f)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]);
    }
    if (req.method === 'GET' && url.pathname === '/shots/' + path.basename(url.pathname.slice(7))) {
      const f = path.join(CFG.lab, 'demo', 'screenshots', path.basename(url.pathname));
      if (!/\.png$/.test(f) || !fs.existsSync(f)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(f), 'image/png');
    }
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return send(res, 200, Object.fromEntries(ACTION_MODULES.map((m) => [m.name, m.meta])));
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return send(res, 200, { state: STATE, busy: current ? { action: current.action, id: current.id } : null });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      if (url.searchParams.get('token') !== TOKEN) return send(res, 403, { error: 'bad token' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ t: 'hello', state: STATE, busy: current ? { action: current.action, id: current.id } : null })}\n\n`);
      for (const ev of history.slice(-1500)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      res.write(`data: ${JSON.stringify({ t: 'synced' })}\n\n`);   // the end of the replayed history: what follows is live
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === 'POST' && (url.pathname === '/api/run' || url.pathname === '/api/stop' || url.pathname === '/api/reset')) {
      if (req.headers['x-console-token'] !== TOKEN || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (url.pathname === '/api/stop') {
        if (current) { current.cancelled = true; killTree(current.child); }
        return send(res, 200, { stopping: !!current });
      }
      if (url.pathname === '/api/reset') {
        if (current) return send(res, 409, { error: 'busy' });
        STATE = { checks: STATE.checks || {} }; history.length = 0; saveState();
        broadcast({ t: 'cleared' });
        return send(res, 200, { reset: true });
      }
      const id = await startAction(String(body.action || ''), String(body.mode || 'live'), body.opt || {});
      return send(res, 200, { id });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.status || 500, { error: e.message });
  }
});

// The event stream is one long request: Node's default requestTimeout (5 minutes) must not cut it. Local only, so no limit.
server.requestTimeout = 0;
server.listen(CFG.port, '127.0.0.1', () => {
  console.log(`Demo console: http://127.0.0.1:${CFG.port}/   (CI demo)`);
  console.log(`              http://127.0.0.1:${CFG.port}/present   (the full presentation)`);
  console.log(`              http://127.0.0.1:${CFG.port}/deck      (the command deck, for a terminal on the shared screen)`);
  console.log(`hello-ai clone: ${CFG.helloAi}`);
  console.log('Stop with Ctrl+C.');
});
