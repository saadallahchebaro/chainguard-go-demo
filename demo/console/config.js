// demo/console/config.js: the lab's fixed names and addresses. Override any of them with the environment
// variables shown, for example CONSOLE_PORT=8078 node demo/console/server.js
'use strict';
const path = require('path');
const os = require('os');

const LAB = path.resolve(__dirname, '..', '..');            // the chainguard-technical-challenge checkout on the Mac

module.exports = {
  port: Number(process.env.CONSOLE_PORT || 8077),
  lab: LAB,
  helloAi: process.env.HELLO_AI || path.resolve(LAB, '..', 'hello-ai'),   // the Mac clone of the pipeline repo
  repo: process.env.CONSOLE_REPO || 'saadallahchebaro/hello-ai',
  ghUser: process.env.CONSOLE_GH_USER || 'saadallahchebaro',              // owns hello-ai; the demo needs it active
  ghWorkUser: process.env.CONSOLE_GH_WORK_USER || '',      // another gh account to switch back to, if any
  vm: 'chainguard',                                   // the build VM: Docker, the tools, the runner, kubectl
  k3sVm: 'k3s',
  registry: '192.168.252.2:5000',                     // the lab registry, as the cluster sees it
  vmLab: '/home/ubuntu/chainguard-technical-challenge',
  vmHelloAi: '/home/ubuntu/hello-ai',
  // An image pushed straight to the registry at step 20, around the gate, never signed
  unsignedDigest: 'sha256:5440f4eff6b76fec901cb753f208c9ed0f7dcaf120547eacd33a05fb0bbfe476',
  agentBin: process.env.AGENT_BIN || 'claude',        // the coding agent's command-line tool, run headless
  agentLabel: process.env.AGENT_LABEL || 'coding agent',
  agentWorkdir: process.env.AGENT_WORKDIR || path.join(os.homedir(), 'agent-sandbox', 'hello-ai-bare'),
  stateFile: path.join(__dirname, '.state.json'),
};
