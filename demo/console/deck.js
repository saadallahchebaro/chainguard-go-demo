// demo/console/deck.js: the command deck. It types the quick answers into a real terminal the presenter has open on
// another screen: a tmux pane on the build VM (the default), or a Terminal or iTerm window on the Mac.
// Only the fixed commands in actions/shortcuts.js can be sent, and only to a target this module has just listed;
// nothing typed in the browser is ever sent.
'use strict';
const { execFile } = require('child_process');
const CFG = require('./config');
const { GROUPS } = require('./actions/shortcuts');

const SESSION = 'show';   // the tmux session the deck creates for the shared screen
const ATTACH = `ssh -t chainguard-lab tmux new -A -s ${SESSION}`;
const COMMANDS = Object.fromEntries(GROUPS.flatMap((g) => g.items.map(([id, title, cmd, o = {}]) => [id, { id, title, cmd, group: g.group, on: o.on || 'vm' }])));

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: 15000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => resolve({ code: err ? (err.code || 1) : 0, out: String(stdout || ''), err: String(stderr || '') }));
});
const vm = (args) => run('multipass', ['exec', CFG.vm, '--', ...args]);
const osa = (lines, argv = []) => run('osascript', [...lines.flatMap((l) => ['-e', l]), ...(argv.length ? ['--', ...argv] : [])]);

// Every place a command can go, freshly listed
async function targets() {
  const list = [], notes = [];
  const t = await vm(['tmux', 'list-panes', '-a', '-F', '#{session_name}:#{window_index}.#{pane_index}\t#{window_name}\t#{pane_current_command}\t#{pane_current_path}\t#{session_attached}']);
  if (t.code === 0) {
    for (const l of t.out.split('\n').filter(Boolean)) {
      const [id, win, cmd, cwd, attached] = l.split('\t');
      list.push({ id: `tmux:${id}`, kind: 'tmux', label: `tmux ${id} (${win}) · ${cmd} in ${cwd.replace('/home/ubuntu', '~')}${attached !== '0' ? ' · open on a screen' : ''}`, session: id.split(':')[0], cwd, cmd });
    }
  } else notes.push('no tmux server on the build VM yet: create the "show" session');
  for (const [app, name] of [['Terminal', 'Terminal'], ['iTerm2', 'iTerm']]) {
    const up = await osa([`application "${app}" is running`]);
    if (up.out.trim() !== 'true') continue;
    const w = await osa([`tell application "${app}"`, 'set out to ""', 'repeat with w in windows', 'set out to out & (id of w) & (character id 9) & (name of w) & linefeed', 'end repeat', 'return out', 'end tell']);
    if (w.code !== 0) { notes.push(`${name}: not listed (${w.err.trim().slice(0, 140) || 'no reason given'}). If macOS asked to allow control of ${name}, allow it in System Settings, Privacy & Security, Automation`); continue; }
    for (const l of w.out.split('\n').filter(Boolean)) {
      const [id, ...rest] = l.split('\t');
      if (/^\d+$/.test(id)) list.push({ id: `${app}:${id}`, kind: app, label: `${name} window: ${rest.join(' ').slice(0, 90)}` });
    }
  }
  // the default: the deck's own tmux session, else the first pane
  const preferred = list.find((x) => x.kind === 'tmux' && x.session === SESSION) || list.find((x) => x.kind === 'tmux') || list[0];
  return { list, notes, preferred: preferred ? preferred.id : null, attach: ATTACH };
}

async function ensureSession() {
  const r = await vm(['bash', '-lc', `tmux has-session -t ${SESSION} 2>/dev/null || tmux new-session -d -s ${SESSION} -c ${CFG.vmLab}`]);
  return r.code === 0;
}

const prepared = new Set();   // tmux panes already set up by this server: the lab folder and Go on the PATH

// Type one command into one target; with enter=false it is typed but not run, so the presenter presses Enter
async function send(targetId, cmdId, enter) {
  const c = COMMANDS[cmdId];
  if (!c) throw Object.assign(new Error('unknown command'), { status: 400 });
  const { list } = await targets();
  const t = list.find((x) => x.id === targetId);
  if (!t) throw Object.assign(new Error('that terminal is no longer open: refresh the list'), { status: 409 });
  if (c.on !== 'vm') throw Object.assign(new Error('this one runs on the k3s VM: use the presentation page'), { status: 400 });
  if (t.kind === 'tmux') {
    const pane = targetId.slice(5);
    await vm(['tmux', 'copy-mode', '-q', '-t', pane]);              // leave scroll mode, or the keys would be read as shortcuts
    // every command is written for the lab folder, with Go on the PATH (a plain login shell on the VM lacks it). The
    // first time this server types into a pane it sets both up, in plain sight; after that it only goes back to the
    // lab folder if the shell has moved.
    if (/^(bash|zsh|sh)$/.test(t.cmd) && (!prepared.has(pane) || t.cwd !== CFG.vmLab)) {
      const lab = CFG.vmLab.replace('/home/ubuntu', '~');
      const setup = prepared.has(pane) ? `cd ${lab}` : `cd ${lab}; export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"`;
      await vm(['tmux', 'send-keys', '-t', pane, '-l', '--', setup]);
      await vm(['tmux', 'send-keys', '-t', pane, 'Enter']);
      prepared.add(pane);
    }
    const r = await vm(['tmux', 'send-keys', '-t', pane, '-l', '--', c.cmd]);
    if (r.code !== 0) throw Object.assign(new Error(`tmux refused: ${r.err.trim()}`), { status: 500 });
    if (enter) await vm(['tmux', 'send-keys', '-t', pane, 'Enter']);
  } else {
    const winId = targetId.split(':')[1];
    // the command and the window id go in as arguments, never pasted into the AppleScript source
    // Terminal can only run a command (typing without Enter would need Accessibility access to fake keystrokes);
    // iTerm can type it and leave Enter to the presenter
    if (t.kind === 'Terminal' && !enter) throw Object.assign(new Error('Terminal can only run a command: tick "Press Enter for me", or use tmux or iTerm to type without running'), { status: 400 });
    const script = t.kind === 'Terminal'
      ? ['on run argv', 'tell application "Terminal" to do script (item 1 of argv) in selected tab of (first window whose id is ((item 2 of argv) as integer))', 'end run']
      : ['on run argv', `tell application "iTerm2" to tell current session of (first window whose id is ((item 2 of argv) as integer)) to write text (item 1 of argv) newline ${enter ? 'true' : 'false'}`, 'end run'];
    const r = await osa(script, [c.cmd, winId]);
    if (r.code !== 0) throw Object.assign(new Error(`${t.kind} refused: ${r.err.trim().slice(0, 160)}`), { status: 500 });
  }
  return { sent: c.cmd, to: t.label };
}

module.exports = { targets, ensureSession, send, meta: { groups: GROUPS.map((g) => ({ group: g.group, items: g.items.map(([id, title, cmd, o = {}]) => ({ id, title, cmd, on: o.on || 'vm', deckOnly: !!o.deckOnly, kind: o.kind || null })) })), attach: ATTACH, session: SESSION } };
