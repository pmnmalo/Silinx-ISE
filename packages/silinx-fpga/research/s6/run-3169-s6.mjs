// #3169 / #3350: measure-3169-s6.sh on the XC6SLX16 then the XC6SLX45, one part at a time, the ISE machine's ssh
// settings read from ~/.silinx/config.json at run time (host, user, identity, port, remoteDir, image; never written in
// a file) and masked in every line printed. `in`: gen-padsingle6.mjs's designs (the *IOB_SINGLE pads' inputs) ->
// <W>/w16/single-pips.json, <W>/w45/…; `out`: gen-padout6.mjs's (the TIOI_OUTER slave outputs) -> outer-pips.json.
// The script starts one ISE container at a time, when the machine runs at most one other; no part is started after
// 07:00 (--any-time: whenever). Then check-held6.mjs <W> (Silinx's writer on ISE's designs).
//   node research/s6/run-3169-s6.mjs in|out <W> [--any-time]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KINDS = { in: ['gen-padsingle6.mjs', 'single-pips.json'], out: ['gen-padout6.mjs', 'outer-pips.json'] };
const args = process.argv.slice(2), anyTime = args.includes('--any-time'), [kind, w] = args.filter(a => a !== '--any-time');
if (!KINDS[kind] || !w) { console.error('usage: node research/s6/run-3169-s6.mjs in|out <W> [--any-time]'); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url)), W = path.resolve(w);
const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.silinx', 'config.json'), 'utf8')).ssh || {};
if (!s.host || !s.remoteDir) { console.error('~/.silinx/config.json: no ssh host or remoteDir (the ISE machine)'); process.exit(2); }
const secrets = [s.user, s.host, s.tailscaleHost, s.homeHost, s.localHost, s.identity, s.remoteDir].filter(x => x && String(x).length > 2);
const mask = t => secrets.reduce((a, x) => a.split(String(x)).join('<masked>'), t);
const sshArgs = [];
if (s.identity) sshArgs.push('-i', s.identity.replace(/^~/, os.homedir()));
if (s.port) sshArgs.push('-p', String(s.port));
const [gen, out] = KINDS[kind];
const env = { ...process.env, SILINX_ISE_HOST: s.user ? `${s.user}@${s.host}` : s.host, ISE_SSH_ARGS: sshArgs.join(' '),
  IMAGE: s.image || 'xilinx/ise:14.7', GEN: gen, OUT: out };
const late = () => { const h = new Date().getHours(); return !anyTime && h >= 7 && h < 20; };

for (const [part, sub] of [['xc6slx16-csg324-3', 'w16'], ['xc6slx45-csg324-3', 'w45']]) {
  if (late()) { console.log(`past 07:00: ${part} not started`); break; }
  console.log(`== ${part} (${new Date().toTimeString().slice(0, 8)})`);
  const code = await new Promise(resolve => {
    const p = spawn('bash', [path.join(here, 'measure-3169-s6.sh'), path.join(W, sub)],
      { env: { ...env, RW: path.posix.join(s.remoteDir, `silinx-3169-${kind}-${sub}`), PART: part }, stdio: ['ignore', 'pipe', 'pipe'] });
    const print = d => process.stdout.write(mask(String(d)));
    p.stdout.on('data', print); p.stderr.on('data', print);
    p.on('close', resolve);
  });
  console.log(`== ${part}: exit ${code} (${new Date().toTimeString().slice(0, 8)})`);
  if (code) process.exit(code);
}
