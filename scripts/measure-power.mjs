// The Silinx toolchain's estimated power (core/power.js, #123) against Xilinx XPower: ISE implements
// each example on each device of the Silinx toolchain and XPower 14.7 reports its power (xpwr -v, its
// default activity rates, no simulation); the numbers of each report are kept in
// test/fixtures/power/xpower-examples.json (never the reports themselves: ISE's outputs are not
// committed), which test/power.test.js compares the estimate with, and from which the model's
// coefficients (core/power.js COEFFICIENTS, DEVICES) are fitted.
//
//   SILINX_ISE_HOST=user@host node scripts/measure-power.mjs        ISE over ssh (the host only from the
//                                                                    environment, never written in a file)
//   SILINX_ISE_HOST=local node scripts/measure-power.mjs            the ISE Docker image on this machine
//   ... node scripts/measure-power.mjs --only vga                    these examples only (comma-separated),
//                                                                    their runs merged into the JSON's
//   node scripts/measure-power.mjs --fit                             the coefficients from the JSON (no ISE)
//   node scripts/measure-power.mjs --compare                         the estimate of each example (the
//                                                                    Silinx toolchain) against the JSON's XPower
//
// The runs are one at a time (the ISE machine also runs the nightly tests: check it is idle).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = path.join(ROOT, 'test/fixtures/power/xpower-examples.json');

/** The numbers of XPower 14.7's verbose text report (xpwr -v): its summary, supplies and per-element tables. */
function parseXpower(text) {
  const lines = text.split('\n');
  const cells = l => l.split('|').slice(1, -1).map(s => s.trim());
  const num = s => (s === undefined || s === '' || s === 'NA' ? null : parseFloat(String(s).replace('~', '')));
  // the rows of the table after the line that names it: the section's title, after its number (not
  // the table of contents' line), or the box with the title of a table
  const table = title => {
    let i = lines.findIndex(l => !l.startsWith('|') && /^\d+(\.\d+)*\.\s+(.*)$/.exec(l.trim())?.[2] === title);
    if (i < 0) i = lines.findIndex(l => l.startsWith('|') && cells(l).length === 1 && cells(l)[0] === title);
    const rows = [];
    if (i < 0) return rows;
    let started = false, dashes = 0;
    for (const l of lines.slice(i + 1)) {
      if (/^-+$/.test(l.trim())) { if (++dashes >= 4) break; continue; }
      if (!l.startsWith('|')) { if (started) break; continue; }
      started = true;
      rows.push(cells(l));
    }
    return rows;
  };
  const out = { release: /\| Release\s*\|\s*([^|]+?)\s*\|/.exec(text)?.[1] || null, summary: {}, supplies: {}, clocks: [], logic: [], signals: [], ios: [] };
  for (const r of table('On-Chip Power Summary')) if (/^(Clocks|Logic|Signals|IOs|BRAMs|MULTs|DCMs|Static Power|Total)$/.test(r[0])) out.summary[r[0]] = num(r[1]);
  for (const r of table('Power Supply Currents')) if (/^Vcc/.test(r[0])) out.supplies[r[0]] = { volts: num(r[1]), totalMa: num(r[2]), dynamicMa: num(r[3]), quiescentMa: num(r[4]) };
  for (const r of table('Thermal Summary')) if (r[0] === 'Junction Temp (C)') out.junctionC = num(r[1]); else if (r[0] === 'Effective TJA (C/W)') out.thetaJa = num(r[1]);
  for (const r of table('Device')) if (r[0] === 'Part') out.part = r[1]; else if (r[0] === 'Package') out.pkg = r[1];
  let kind = null, domain = null;
  for (const r of table('By Clock Domain')) {
    if (r.length < 7 || /^By Clock Domain/.test(r[0]) || !r[0] || r[0] === 'Total') continue;
    if (r[0] === 'Logic:' || r[0] === 'Nets:') { kind = r[0] === 'Logic:' ? 'buffer' : 'net'; continue; }
    if (!r[1] && !r[2]) { domain = r[0]; continue; }
    out.clocks.push({ domain, kind, name: r[0], mw: num(r[1]), mhz: num(r[2]), buffer: r[3], fanout: num(r[6]), sliceFanout: num(r[7]) });
  }
  for (const r of table('Logic')) if (r.length >= 6 && r[0] && r[0] !== 'Logic' && r[0] !== 'Total') out.logic.push({ mw: num(r[1]), type: r[2].split(' ')[0], rate: num(r[5]) });
  for (const r of table('Signals')) if (r.length >= 8 && r[0] && r[0] !== 'Signals' && r[0] !== 'Total') out.signals.push({ mw: num(r[1]), rate: num(r[2]), fanout: num(r[4]) });
  for (const r of table('IO')) if (r.length >= 10 && r[0] && r[0] !== 'IO' && r[0] !== 'Total' && !/^Internal VREFs/.test(r[0])) out.ios.push({ name: r[0], mw: num(r[1]), std: r[2], rate: num(r[3]), out: num(r[8]) > 0 || num(r[9]) > 0 });
  return out;
}

/** What test/power.test.js and the fit need of a report: its totals and the sums of its elements. */
function summarize(x) {
  const sum = (l, f) => l.reduce((s, e) => s + (f(e) || 0), 0);
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return {
    part: x.part, pkg: x.pkg, junctionC: x.junctionC, thetaJa: x.thetaJa,
    power: { clocks: x.summary.Clocks ?? 0, logic: x.summary.Logic ?? 0, signals: x.summary.Signals ?? 0, ios: x.summary.IOs ?? 0, static: x.summary['Static Power'], total: x.summary.Total },
    quiescentMa: Object.fromEntries(Object.entries(x.supplies).map(([k, s]) => [k, s.quiescentMa])),
    clocks: x.clocks.filter(c => c.kind === 'buffer' && /GCLKMUX/.test(c.buffer)).map(c => {
      const nets = x.clocks.filter(n => n.kind === 'net' && n.domain === c.domain && n.fanout > 1);
      return { mhz: c.mhz, bufferMw: c.mw, netMw: sum(nets, n => n.mw), slices: sum(nets, n => n.sliceFanout) };
    }),
    // the regressions' sums: outputs by standard (rate, mW), inputs, signals, logic
    outputs: Object.values(x.ios.filter(i => i.out).reduce((m, i) => { const o = (m[i.std] ||= { std: i.std, n: 0, rate: 0, mw: 0 }); o.n++; o.rate = r4(o.rate + i.rate); o.mw = r4(o.mw + i.mw); return m; }, {})),
    inputs: { n: x.ios.filter(i => !i.out).length, rate: r4(sum(x.ios.filter(i => !i.out), i => i.rate)), mw: r4(sum(x.ios.filter(i => !i.out), i => i.mw)) },
    signals: { n: x.signals.length, rate: r4(sum(x.signals, s => s.rate)), rateFanout: r4(sum(x.signals, s => s.rate * s.fanout)) },
    logic: { lutRate: r4(sum(x.logic.filter(l => /^[FG]$/.test(l.type)), l => l.rate)), ffRate: r4(sum(x.logic.filter(l => /^FF/.test(l.type)), l => l.rate)) },
  };
}

/**
 * The runs of the JSON with fresh ones in place of theirs (the same example, board and variant) or added: in
 * the order of the examples (`examples`, e.g. EXAMPLE_ORDER) and of the targets (`targets`, TARGETS).
 */
export function mergeRuns(old, fresh, examples, targets) {
  const key = r => `${r.example} ${r.board}-${r.variant}`;
  const byKey = new Map([...old, ...fresh].map(r => [key(r), r]));
  const rank = r => {
    const e = examples.indexOf(r.example), t = targets.findIndex(x => x.board === r.board && x.variant === r.variant);
    return (e < 0 ? examples.length : e) * (targets.length + 1) + (t < 0 ? targets.length : t);
  };
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

// least squares without an intercept: the b of y ≈ X b
function leastSquares(X, y) {
  const n = X[0].length, A = Array.from({ length: n }, () => new Array(n).fill(0)), v = new Array(n).fill(0);
  X.forEach((r, i) => { for (let a = 0; a < n; a++) { v[a] += r[a] * y[i]; for (let b = 0; b < n; b++) A[a][b] += r[a] * r[b]; } });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = 0; r < n; r++) if (r !== c && A[c][c]) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; v[r] -= f * v[c]; }
  }
  return v.map((x, i) => (A[i][i] ? x / A[i][i] : 0));
}

/** The model's coefficients fitted to the runs of the JSON (core/power.js COEFFICIENTS and DEVICES). */
export function fit(runs) {
  const ok = l => l.filter(Boolean);
  const bufs = runs.flatMap(r => r.clocks);
  const k = { bufgPerMhz: leastSquares(bufs.map(c => [c.mhz]), bufs.map(c => c.bufferMw))[0] };
  [k.lutPerRate, k.ffPerRate] = leastSquares(runs.map(r => [r.logic.lutRate, r.logic.ffRate]), runs.map(r => r.power.logic));
  [k.netPerRate, k.netFanoutPerRate] = leastSquares(runs.map(r => [r.signals.rate, r.signals.rateFanout]), runs.map(r => r.power.signals));
  const out25 = ok(runs.flatMap(r => r.outputs.filter(o => /^LVCMOS25/.test(o.std))));
  k.outputPerRate25 = leastSquares(out25.map(o => [o.rate]), out25.map(o => o.mw))[0];
  k.inputPerRate = leastSquares(runs.map(r => [r.inputs.rate]), runs.map(r => r.inputs.mw))[0];
  // each device: its global clock net by the slices it reaches; Vccint's quiescent current against
  // the junction temperature, Vccaux's and Vcco's; the package's θJA
  const devices = {};
  for (const part of [...new Set(runs.map(r => r.part))]) {
    const rs = runs.filter(r => r.part === part);
    const [a, b] = leastSquares(rs.map(r => [1, r.junctionC - 25]), rs.map(r => r.quiescentMa.Vccint));
    const vcco = Object.entries(rs[0].quiescentMa).find(([s]) => /^Vcco/.test(s))?.[1] ?? 0;
    const cs = rs.flatMap(r => r.clocks);
    const [net, perSlice] = cs.length ? leastSquares(cs.map(c => [c.mhz, c.mhz * c.slices]), cs.map(c => c.netMw)) : [0, 0];
    devices[part] = { clockNetPerMhz: net, clockSlicePerMhz: perSlice, vccint: a, vccintPerC: b, vccaux: rs[0].quiescentMa.Vccaux, vcco, thetaJa: rs[0].thetaJa };
  }
  return { coefficients: k, devices };
}

/**
 * The Silinx toolchain's estimate for an example on a target ({ board, variant }): the flow (as the
 * browser edition runs it, in memory) through the estimated power. Returns { estimate, report, log,
 * top, text (build/<top>.pwr) }.
 */
export async function silinxEstimate(example, target) {
  const zlib = await import('node:zlib');
  const { exampleProject } = await import('../test/examples-lib.mjs');
  const { runOpenFlow } = await import('../core/open-flow-core.js');
  const { loadDevice } = await import('../core/fpga/device.js');
  const { dbFileNames, dbFilesFrom, makeBitDb } = await import('../core/fpga/bitdb.js');
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { shippedDevicePath } = await import('../core/fpga/device-node.js');
  const { estimatePower } = await import('../core/power.js');
  const { parseXdl } = await import('../core/xdl.js');
  const { parseUcf } = await import('../core/ucf.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-estimate-'));
  try {
    const { dir, project } = exampleProject(example, target, tmp);
    const d = project.device, part = `${d.part}${d.package}${d.speed}`;
    const spec = { top: project.top, part, device: d.part, pkg: d.package, family: 'spartan3e', graph: shippedDevicePath(part), steps: ['synth', 'translate', 'map', 'par', 'trce', 'xpwr'], seed: 1, effort: 1 };
    const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
    const dbDir = path.join(ROOT, 'packages/silinx-fpga/bitdb'), json = {};
    for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) { const p = path.join(dbDir, f); json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
    const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, part);
    const ucf = fs.readFileSync(path.join(dir, project.constraints), 'utf8');
    const design = project.files.filter(f => (f.role || 'design') === 'design' && /^(vhdl|verilog)$/.test(f.lang));
    const store = {}, log = [];
    let report = null;
    const r = await runOpenFlow(spec, {
      log: l => log.push(l), sources: () => design.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(dir, s.path), 'utf8') })),
      ucf, ucfName: path.basename(project.constraints), device: () => device, bitDb: () => db, yosys: yosysNode,
      write: (n, data) => { store[n] = data; return `build/${n}`; }, read: n => (typeof store[n] === 'string' ? store[n] : null), save: x => { report = x; },
    });
    if (!r.ok) throw new Error(`${example} on the ${target.board}-${target.variant}: ${r.error}`);
    const estimate = estimatePower(parseXdl(store['open/routed.xdl']), { device: spec.device, periods: parseUcf(ucf).clocks });
    return { estimate, report, log, top: project.top, text: store[`${project.top}.pwr`] };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function measure() {
  const HOST = process.env.SILINX_ISE_HOST;
  if (!HOST) { console.error('set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local; or --fit'); process.exit(2); }
  const host = HOST === 'local' ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(HOST);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-measure-power-'));
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  const image = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7', settings = '/opt/Xilinx/14.7/ISE_DS/settings64.sh';
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(host
    ? { mode: 'ssh', ssh: { host: host[2], user: host[1] || '', remoteDir: 'silinx-measure-power', image, settings } }
    : { mode: 'docker', docker: { image, platform: 'linux/amd64', settings } }));
  const { EXAMPLES, TARGETS, exampleProject } = await import('../test/examples-lib.mjs');
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
  const unknown = (only || []).filter(e => !EXAMPLES.includes(e));
  if (unknown.length) { console.error(`not an example: ${unknown.join(', ')}`); process.exit(2); }
  const { createJob } = await import('../server/jobs.js');
  const { runImplementation } = await import('../server/ise.js');
  const runs = [];
  let release = null;
  try {
    for (const example of only || EXAMPLES) {
      for (const t of TARGETS) {
        const { dir, project } = exampleProject(example, t, path.join(tmp, 'p'));
        const job = createJob('power', j => runImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'xpwr'] }));
        while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
        if (job.status !== 'ok') throw new Error(`${example} on the ${t.board}-${t.variant}: ${job.lines.filter(l => /ERROR/.test(l)).join('\n')}`);
        const x = parseXpower(fs.readFileSync(path.join(dir, 'build', `${project.top}.pwr`), 'latin1'));
        release ||= x.release;
        runs.push({ example, board: t.board, variant: t.variant, ...summarize(x) });
        console.log(`${example} ${t.board}-${t.variant}: ${x.summary.Total} mW`);
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const all = only ? mergeRuns(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).runs, runs, EXAMPLES, TARGETS) : runs;
  fs.writeFileSync(FIXTURE, `${JSON.stringify({ tool: `XPower ${release}`, command: 'xpwr -v (default activity rates, no simulation), ISE 14.7 implementation of each example', runs: all }, null, 1)}\n`);
  console.log(`wrote ${path.relative(ROOT, FIXTURE)} (${all.length} runs, ${runs.length} measured now)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--compare')) {
    // the estimate's total and dynamic power against XPower's, example by example
    const { runs } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    console.log('example    target          XPower mW  estimate mW  total error  dynamic: XPower  estimate');
    for (const x of runs) {
      const { estimate: e } = await silinxEstimate(x.example, { board: x.board, variant: x.variant });
      const err = (100 * (e.totalMw - x.power.total)) / x.power.total;
      console.log(`${x.example.padEnd(10)} ${`${x.board}-${x.variant}`.padEnd(15)} ${x.power.total.toFixed(2).padStart(9)}  ${e.totalMw.toFixed(2).padStart(11)}  ${`${err.toFixed(1)} %`.padStart(11)}  ${(x.power.total - x.power.static).toFixed(2).padStart(15)}  ${e.dynamicMw.toFixed(2).padStart(8)}`);
    }
  } else {
    if (!process.argv.includes('--fit')) await measure();
    const { runs } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    console.log(JSON.stringify(fit(runs), null, 1));
  }
}
