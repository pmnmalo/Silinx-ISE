// trce against the Silinx toolchain's static timing (#601): the clocks of a DCM, the paths between two clocks
// and the pads of a DCM's clock. For each project: Silinx's open flow (open-flow.mjs: routed.xdl, timing.txt)
// and ISE's build files (server/ise.js generateBuild), here; on the ISE host (the user's ISE settings in SSH mode,
// ~/.silinx/config.json, or SILINX_ISE_HOST; its host never written in a file) ISE's own flow and trce on both routings
// (ise-timing-check.sh); back here only trce's reports, ise.twr and silinx.twr, next to Silinx's timing.txt.
//   node research/s3e-route/dcm-timing.mjs [--silinx-only] <out folder> <project folder>…
// trce reads no UCF for an NCD from XDL (xdl -xdl2ncd: no constraints found), so Silinx's routing gets a PCF in the
// form ISE's map writes (silinxPcf): a TIMEGRP of each clock's flip-flops, its PERIOD derived from the pad's as ISE
// derives it (TS_clk / 1.5 PHASE 2.5 ns), the OFFSET constraints. --silinx-only: trce on Silinx's routing only.
// One ISE job at a time. The reports stay in the out folder (outside the repository: ISE's outputs are never committed).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateBuild } from '../../../../server/ise.js';
import { parseXdl } from '../../src/xdl.js';
import { parseUcf } from '../../src/ucf.js';
import { clockSources } from '../../src/fpga/timing.js';

/** A PCF for a design routed by Silinx (XDL text) and its UCF, as ISE's map writes one: each clock's flip-flops in a
 *  TIMEGRP; the pad's PERIOD on the first DCM's CLKIN (or on the clock's flip-flops when it has no DCM); a DCM's clocks
 *  derived from it (TS_<pad> * f or / 1/f, PHASE in ns); the UCF's global OFFSET constraints. */
export function silinxPcf(xdlText, ucfText) {
  const design = parseXdl(xdlText), pu = parseUcf(ucfText);
  const src = clockSources(design);
  const ffsOf = new Map();
  for (const n of design.nets) for (const p of n.inpins) {
    if (p.pin !== 'CLK') continue;
    const i = design.insts.find(x => x.name === p.inst);
    const bels = (i?.cfg || []).filter(c => /^FF[XY]$/.test(c.attr) && c.name).map(c => c.name);
    if (bels.length) ffsOf.set(n.name, [...(ffsOf.get(n.name) || []), ...bels]);
  }
  const q = s => `"${s}"`, num = x => String(+x.toFixed(6));
  const lines = ['SCHEMATIC START;'];
  for (const k of pu.clocks) {
    const port = String(k.net).toLowerCase(), ts = `TS_${k.net}`;
    const mine = [...src].filter(([net, s]) => String(s.port).toLowerCase() === port && ffsOf.has(net));
    const dcm = mine.find(([, s]) => s.via.length)?.[1].via[0].dcm;
    if (dcm) {
      lines.push(`PIN ${k.net}_clkin = BEL ${q(dcm)} PINNAME CLKIN;`, `TIMEGRP ${k.net} = PIN ${q(`${k.net}_clkin`)};`);
      lines.push(`${ts} = PERIOD TIMEGRP ${q(k.net)} ${num(k.period)} ns HIGH 50%;`);
    }
    for (const [net, s] of mine) {
      const grp = net.replace(/\W/g, '_');
      lines.push(`TIMEGRP ${grp} = ${ffsOf.get(net).map(b => `BEL ${q(b)}`).join(' ')};`);
      if (!dcm) { lines.push(`${ts} = PERIOD TIMEGRP ${q(grp)} ${num(k.period)} ns HIGH 50%;`); continue; }
      const rel = s.f === 1 ? '' : s.f > 1 ? ` * ${num(s.f)}` : ` / ${num(1 / s.f)}`, ph = s.o ? ` PHASE ${num(s.o * k.period)} ns` : '';
      lines.push(`TS_${grp} = PERIOD TIMEGRP ${q(grp)} ${ts}${rel}${ph} HIGH 50%;`);
    }
  }
  for (const st of pu.other || []) {
    const m = /^OFFSET\s*=\s*(IN|OUT)\s+([\d.]+)\s*ns\s+(BEFORE|AFTER)\s+"?([^"\s;]+)"?/i.exec(String(st).trim());
    if (m) lines.push(`OFFSET = ${m[1].toUpperCase()} ${m[2]} ns ${m[3].toUpperCase()} COMP ${q(m[4])};`);
  }
  lines.push('SCHEMATIC END;');
  return `${lines.join('\n')}\n`;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();

async function main() {
const argv = process.argv.slice(2), silinxOnly = argv.includes('--silinx-only');
const [outDir, ...projects] = argv.filter(a => a !== '--silinx-only');
if (!outDir || !projects.length) { console.error('usage: dcm-timing.mjs [--silinx-only] <out folder> <project folder>…'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.silinx', 'config.json'), 'utf8')).ssh || {};
if (!cfg.host) throw new Error('~/.silinx/config.json: no ssh host (the ISE machine)');
// (SILINX_ISE_HOST=user@host: another address of the same machine, e.g. away from its network)
const host = process.env.SILINX_ISE_HOST || `${cfg.user ? `${cfg.user}@` : ''}${cfg.host}`;
const sshArgs = ['-o', 'BatchMode=yes', ...(cfg.port && cfg.port !== 22 ? ['-p', String(cfg.port)] : [])];
const ssh = cmd => execFileSync('ssh', [...sshArgs, '--', host, `export PATH="$PATH:/usr/local/bin"; ${cmd}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
const send = path.join(outDir, 'send');
fs.rmSync(send, { recursive: true, force: true });
const names = [];
for (const p of projects) {
  const name = path.basename(path.resolve(p));
  const proj = JSON.parse(fs.readFileSync(path.join(p, 'silinx.json'), 'utf8'));
  const r = spawnSync(process.execPath, [path.join(HERE, 'open-flow.mjs'), p, path.join(outDir, name)], { encoding: 'utf8' });
  if (r.status !== 0) { console.log(`${name}: open flow FAILED\n${r.stderr.slice(-2000)}`); continue; }
  // (ISE's build from a copy: generateBuild writes <project>/build)
  const copy = path.join(outDir, 'proj', name);
  fs.rmSync(copy, { recursive: true, force: true });
  fs.cpSync(p, copy, { recursive: true, filter: f => !/[\\/]build$/.test(f) });
  if (proj.constraints?.startsWith('../')) fs.copyFileSync(path.join(p, proj.constraints), path.join(copy, path.basename(proj.constraints)));
  const { buildDir } = await generateBuild({ ...proj, constraints: path.basename(proj.constraints || '') || undefined }, copy);
  fs.cpSync(buildDir, path.join(send, name), { recursive: true });
  fs.copyFileSync(path.join(outDir, name, 'routed.xdl'), path.join(send, name, 'silinx.xdl'));
  fs.writeFileSync(path.join(send, name, 'top.txt'), `top=${proj.top}\n${silinxOnly ? 'silinxOnly=1\n' : ''}`);
  fs.writeFileSync(path.join(send, name, 'silinx.pcf'), silinxPcf(fs.readFileSync(path.join(send, name, 'silinx.xdl'), 'utf8'), fs.readFileSync(path.join(send, name, `${proj.top}.ucf`), 'utf8')));
  names.push(name);
}
fs.copyFileSync(path.join(HERE, 'ise-timing-check.sh'), path.join(send, 'ise-timing-check.sh'));
const remote = `silinx-timing/${path.basename(fs.mkdtempSync(path.join(os.tmpdir(), 'dcm-timing-')))}`;
ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, `${send}/`, `${host}:${remote}/`]);
console.log(ssh(`docker run --rm --platform linux/amd64 -v "$HOME/${remote}":/w ${cfg.image || 'xilinx/ise:14.7'} bash /w/ise-timing-check.sh /w ${names.join(' ')}`));
for (const n of names) {
  execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, '--include=*.twr', '--include=*.log', '--include=*.pcf', '--exclude=*', `${host}:${remote}/${n}/`, path.join(outDir, n, 'ise') + '/']);
}
ssh(`rm -rf ${remote}`);
fs.rmSync(send, { recursive: true, force: true });
}
