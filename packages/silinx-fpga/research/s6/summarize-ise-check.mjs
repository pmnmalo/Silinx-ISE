// ISE's check of the Spartan-6 placer and router (research/s6/ise-place-check.sh's logs) as Silinx's own record:
// research/s6/measured/ise-check.json, the messages by their id and count (no Xilinx file, no design text).
//
//   node research/s6/summarize-ise-check.mjs <folder of the logs: <design>/xdl2ncd.log, par.log, drc-par.log …>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) { console.error('usage: node research/s6/summarize-ise-check.mjs <folder>'); process.exit(1); }
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
// the messages of a log by kind and id: { 'WARNING:PhysDesignRules:10': 31 } (a message's continuation lines left out)
const messages = text => {
  const out = {};
  for (const m of String(text || '').matchAll(/^(WARNING|ERROR):(\w+)(?::(\d+))? -/gm)) { const k = `${m[1]}:${m[2]}${m[3] ? `:${m[3]}` : ''}`; out[k] = (out[k] || 0) + 1; }
  return out;
};
const drc = text => { const m = /<(\d+)> errors and <(\d+)> warnings/.exec(String(text || '')); return m ? { errors: +m[1], warnings: +m[2], messages: messages(text) } : null; };
const out = { ise: 'ISE 14.7: xdl -xdl2ncd, par -k, drc', designs: {} };
for (const d of fs.readdirSync(dir).filter(x => fs.existsSync(path.join(dir, x, 'xdl2ncd.log'))).sort()) {
  const f = x => read(path.join(dir, d, x));
  const e = {};
  e.placed = {
    xdl2ncd: /Successfully converted/.test(f('xdl2ncd.log')) ? 'ok' : 'failed', messages: messages(f('xdl2ncd.log')),
    par: /All signals are completely routed/.test(f('par.log') || '') ? 'complete' : 'incomplete', drc: drc(f('drc-par.log')),
  };
  if (f('xdl2ncd-routed.log') !== null) e.routed = { xdl2ncd: /Successfully converted/.test(f('xdl2ncd-routed.log')) ? 'ok' : 'failed', messages: messages(f('xdl2ncd-routed.log')), drc: drc(f('drc.log')) };
  out.designs[d] = e;
  console.log(d, JSON.stringify(e));
}
fs.writeFileSync(path.join(here, 'measured', 'ise-check.json'), JSON.stringify(out, null, 1) + '\n');
