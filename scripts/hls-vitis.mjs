#!/usr/bin/env node
// AMD's Vitis HLS as the oracle of the HLS corpus (#1624): each design of test/hls-corpus/manifest.json through
// Vitis HLS on the ISE runner's machine (a Docker image of its own, scripts/vitis-hls-image/: Vivado ML Standard,
// free for the small 7-series parts), its C simulation, C synthesis (a fixed small Artix-7, the Vivado flow's
// interfaces) and C/RTL co-simulation; per design the C simulation's result, the RTL ports (csynth.xml), the latency
// and each loop's II, the co-simulation's status and latency, compared with Silinx HLS's on the same sources
// (test/hls-corpus/lib.mjs, cToHdl's ports and report). Vitis does not target the Spartan-3E: it checks the ports and
// the behaviour at them, and its latency is a quality reference (Silinx's schedule is its own).
//
//   node scripts/hls-vitis.mjs [--filter pointer] [--update]
//     --filter: a regular expression on the designs' names (#1780), e.g. '^(modeling-pointers|pipelining-loops)-'
//     --update: the results written to test/hls-corpus/vitis.json and the table of test/hls-corpus/README.md
//   node scripts/hls-vitis.mjs --detach [--filter …]   Vitis started on the host in the background (a run of the whole
//     corpus takes hours: it does not depend on this machine staying awake); it prints the run's name
//   node scripts/hls-vitis.mjs --collect <run> [--update]   its results fetched once it is done (else its progress);
//     the run's folder on the host deleted only once --update has saved them (#1826)
//   SILINX_ISE_HOST=user@host (else ~/.silinx/config.json's ssh user and host, read here, never written in a file),
//   SILINX_ISE_HOST=local: the image on this machine; SILINX_VITIS_IMAGE (default xilinx/vitis-hls:2025.2),
//   SILINX_VITIS_PART (default xc7a35tcpg236-1); SILINX_ISE_REMOTE_DIR as scripts/check-open-flow.mjs.
// Vitis's own files (reports, logs, HDL) stay in a temporary folder, deleted after the run: only numbers and port names
// are written (#1624, never commit Xilinx files).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HLS = path.join(ROOT, 'test', 'hls-corpus');
export const PART = 'xc7a35tcpg236-1';

/** The config Vitis runs a design with: its hls_config.cfg with the part, the Vivado flow's interfaces (ap_ctrl_hs,
 *  ap_vld, ap_memory: Silinx's) and no packaging nor Vivado run (an IP export is slow and not compared). */
export function vitisConfig(text, { part = PART } = {}) {
  const drop = /^\s*(part|flow_target|package\.[\w.]*|vivado\.[\w.]*|cosim\.trace_level|cosim\.wave_debug)\s*=/;
  const lines = String(text).split('\n').filter((l) => !drop.test(l));
  const hls = lines.findIndex((l) => /^\s*\[hls\]\s*$/.test(l));
  if (hls >= 0) lines.splice(hls + 1, 0, 'flow_target=vivado');
  else lines.unshift('flow_target=vivado');
  return [`part=${part}`, ...lines].join('\n').replace(/\n*$/, '\n');
}

// (an element's text: a number, a range's <min>/<max>, or null: undef, -, absent)
const tag = (xml, t) => { const m = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml); return m ? m[1].trim() : null; };
const num = (s) => (s !== null && /^\d+$/.test(s) ? Number(s) : null);
function range(s) {
  if (s === null) return null;
  if (/<range>/.test(s)) { const min = num(tag(s, 'min')), max = num(tag(s, 'max')); return min === null && max === null ? null : { min, max }; }
  const n = num(s);
  return n === null ? null : { min: n, max: n };
}

/** An XML fragment's element tree: { tag, text, children } (text: the element's inner XML, trimmed). */
export function elements(xml) {
  const root = { tag: null, text: String(xml).trim(), children: [] }, stack = [root];
  const re = /<(\/?)([\w.:-]+)[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, name, empty] = m;
    if (close) {
      const el = stack.pop();
      el.text = xml.slice(el.start, m.index).trim();
      delete el.start;
    } else {
      const el = { tag: name, text: '', children: [], start: re.lastIndex };
      stack.at(-1).children.push(el);
      if (empty) delete el.start; else stack.push(el);
    }
  }
  return root;
}

/** csynth.xml (the top's synthesis report): { latency: {min,max}, interval: {min,max}, loops: [{ name, line, trip,
 *  latency, ii, iterationLatency }], ports: [{ name, dir, w, protocol, object }] } (null: unknown). */
export function parseCsynth(xml) {
  const overall = tag(xml, 'SummaryOfOverallLatency') || '';
  const lat = (a, b) => { const x = num(tag(overall, a)), y = num(tag(overall, b)); return x === null && y === null ? null : { min: x, max: y }; };
  // (the loops: the summary's elements, each named as its loop, an inner loop an element of its outer loop's)
  const loops = [];
  const walk = (el) => {
    for (const c of el.children) {
      if (!c.children.some((x) => x.tag === 'TripCount' || x.tag === 'Latency')) continue;
      const f = (t) => { const x = c.children.find((y) => y.tag === t); return x ? x.text : null; };
      const line = /^VITIS_LOOP_(\d+)_\d+$/.exec(c.tag);
      loops.push({ name: c.tag, line: line ? Number(line[1]) : null, trip: range(f('TripCount')), latency: range(f('Latency')), ii: num(f('PipelineII')), iterationLatency: range(f('IterationLatency')) });
      walk(c);
    }
  };
  walk(elements(tag(xml, 'SummaryOfLoopLatency') || ''));
  const ports = [];
  for (const m of String(xml).matchAll(/<RtlPorts>([\s\S]*?)<\/RtlPorts>/g)) {
    const p = m[1];
    ports.push({ name: tag(p, 'name'), dir: tag(p, 'Dir'), w: num(tag(p, 'Bits')), protocol: tag(p, 'IOProtocol') || null, object: tag(p, 'Object') || null });
  }
  return { latency: lat('Best-caseLatency', 'Worst-caseLatency'), interval: lat('Interval-min', 'Interval-max'), loops, ports };
}

/** The co-simulation report (<top>_cosim.rpt): { status: 'pass' | 'fail' | null, latency: {min,avg,max} | null } of
 *  its Verilog row (else its VHDL row). */
export function parseCosim(text) {
  const rows = {};
  for (const l of String(text).split('\n')) {
    const c = l.split('|').map((x) => x.trim());
    if (c.length >= 6 && /^(VHDL|Verilog)$/.test(c[1])) rows[c[1]] = c;
  }
  const r = rows.Verilog && rows.Verilog[2] !== 'NA' ? rows.Verilog : rows.VHDL;
  if (!r || r[2] === 'NA') return { status: null, latency: null };
  const n = (s) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : null);
  const latency = n(r[3]) === null ? null : { min: n(r[3]), avg: n(r[4]), max: n(r[5]) };
  return { status: /^pass$/i.test(r[2]) ? 'pass' : 'fail', latency };
}

/** The run's status file (hls-vitis-run.sh: "<step> <exit code>" a line) and the C simulation's log: { csim, synth,
 *  cosim } each 'pass', 'fail' or 'skip' (a step not run). The C simulation passes when it exits with 0 and its log
 *  reports no error. */
export function parseStatus(text, csimLog = '') {
  const r = { csim: 'skip', synth: 'skip', cosim: 'skip' };
  for (const l of String(text).split('\n')) {
    const m = /^(csim|synth|cosim)\s+(\d+)\s*$/.exec(l.trim());
    if (m) r[m[1]] = m[2] === '0' ? 'pass' : 'fail';
  }
  const done = /CSim done with (\d+) errors?/.exec(csimLog);
  if (r.csim === 'pass' && ((done && done[1] !== '0') || /^ERROR: \[SIM /m.test(csimLog))) r.csim = 'fail';
  return r;
}

/** Silinx's ports against Vitis's: { same, missing: [Vitis's not made], extra: [Silinx's not in Vitis], differ:
 *  [{ name, vitis: 'in 32', silinx: 'out 32' }] } (by name; a direction or a width that differs). */
export function comparePorts(silinx, vitis) {
  const S = new Map(silinx.map((p) => [p.name, p])), V = new Map(vitis.map((p) => [p.name, p]));
  const missing = vitis.filter((p) => !S.has(p.name)).map((p) => p.name);
  const extra = silinx.filter((p) => !V.has(p.name)).map((p) => p.name);
  const differ = [];
  for (const v of vitis) {
    const s = S.get(v.name);
    if (s && (s.dir !== v.dir || s.w !== v.w)) differ.push({ name: v.name, vitis: `${v.dir} ${v.w}`, silinx: `${s.dir} ${s.w}` });
  }
  return { same: !missing.length && !extra.length && !differ.length, missing, extra, differ };
}

const span = (r) => (!r ? '-' : r.min === r.max ? `${r.min}` : `${r.min ?? '?'}-${r.max ?? '?'}`);

/** The README's table of the comparison. */
export function vitisTable(manifest, results, { image = '', part = PART } = {}) {
  const L = [`Vitis HLS (${image || 'its image'}, ${part}) against Silinx HLS: the C simulation, the ports, the latency (cycles) and the loops' II (Vitis's pipelined loops).`, '',
    '| Design | C simulation (Vitis / Silinx) | Co-simulation (Vitis / Silinx) | Ports | Latency (Vitis / Silinx) | Loops\' II (Vitis / Silinx) |', '|---|---|---|---|---|---|'];
  for (const d of manifest.designs) {
    const r = results[d.name];
    if (!r) continue;
    const pc = r.ports ? (r.ports.same ? 'same' : [r.ports.missing.length && `missing ${r.ports.missing.join(', ')}`, r.ports.extra.length && `extra ${r.ports.extra.join(', ')}`, ...r.ports.differ.map((x) => `${x.name}: ${x.silinx}, not ${x.vitis}`)].filter(Boolean).join('; ')) : '-';
    const ii = r.vitis.loops.filter((l) => l.ii !== null).map((l) => `${l.name} ${l.ii} / ${r.silinx.loops.find((s) => s.name === l.name || s.line === l.line)?.ii ?? '-'}`).join(', ') || '-';
    L.push(`| ${d.name} | ${r.vitis.csim} / ${r.silinx.csim} | ${r.vitis.cosim} / ${r.silinx.cosim} | ${pc.replace(/\|/g, '\\|')} | ${span(r.vitis.latency)} / ${span(r.silinx.latency)} | ${ii} |`);
  }
  const all = Object.values(results);
  L.push('', `${all.length} designs: ${all.filter((r) => r.vitis.csim === 'pass').length} through Vitis's C simulation, ${all.filter((r) => r.ports?.same).length} with Silinx's ports the same as Vitis's.`);
  return L.join('\n');
}

/** A design's comparison record from Vitis's parsed results and Silinx's run (lib.mjs's runDesign, cToHdl). */
export function compareDesign(vitis, silinx) {
  return { vitis, silinx, ports: vitis.ports.length && silinx.ports.length ? comparePorts(silinx.ports, vitis.ports) : null };
}

/** The designs whose name matches --filter, a regular expression (#1780: a set of designs, e.g. the small ones);
 * every design with no filter. */
export function selectDesigns(designs, filter) {
  const re = filter ? new RegExp(filter) : null;
  return designs.filter((d) => !re || re.test(d.name));
}

/** Whether --collect keeps a run's folder on the host: until --update has saved its results (#1826: a --collect with
 * no --update had deleted them, and the results were lost). */
export function keepsRun(args) {
  return !args.includes('--update');
}

async function main() {
  const { fetchDesignCorpus, sourceDir } = await import('./fetch-design-corpus.mjs');
  const { runDesign, unitOf } = await import('../test/hls-corpus/lib.mjs');
  const { cToHdl } = await import('../core/c-hdl.js');
  const { iseWorkBase, configPath } = await import('../server/toolchain.js');
  const { DOCKER_ISOLATION } = await import('../server/ise.js');
  const a = process.argv.slice(2);
  const filter = a.includes('--filter') ? a[a.indexOf('--filter') + 1] : '';
  const IMAGE = process.env.SILINX_VITIS_IMAGE || 'xilinx/vitis-hls:2025.2';
  const part = process.env.SILINX_VITIS_PART || PART;
  // the host: only from the environment or the user's config, never written in a file
  let HOST = process.env.SILINX_ISE_HOST;
  if (!HOST) try { const s = JSON.parse(fs.readFileSync(configPath(), 'utf8')).ssh; if (s?.host) HOST = s.user ? `${s.user}@${s.host}` : s.host; } catch { /* no config */ }
  if (!HOST) { console.error('set SILINX_ISE_HOST=user@host (the machine with the Vitis HLS image, reached by ssh with a key), or SILINX_ISE_HOST=local'); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(path.join(HLS, 'manifest.json'), 'utf8'));
  const collect = a.includes('--collect') ? a[a.indexOf('--collect') + 1] : null;
  if (collect && !/^silinx-vitis-[\w]+$/.test(collect)) { console.error(`--collect: not a run's name: ${collect}`); process.exit(2); }
  const filesOf = (d) => [...d.files, ...d.tb, ...d.headers];
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
  const ssh = (cmd) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4', '-o', 'ConnectTimeout=30', '--', HOST, `export PATH="$PATH:/usr/local/bin"; ${cmd}`]);
  const remoteOf = (name) => `${iseWorkBase('silinx-vitis')}/${name}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-vitis-'));
  let designs;
  try {
    if (collect) {
      // a detached run: its progress, or its results once its last design is done
      const remote = remoteOf(collect);
      const state = ssh(`cd ${remote} && wc -l < designs.txt && (ls results 2>/dev/null | wc -l) && (ls done 2>/dev/null || docker ps -q -f name=${collect} | sed 's/.*/running/')`).trim().split(/\s+/);
      if (state[2] !== 'done') {
        console.log(`${collect}: ${state[1]} of ${state[0]} designs started, ${state[2] === 'running' ? 'still running' : 'STOPPED before its end (its container is gone): run it again'}`);
        process.exitCode = 3;
        return;
      }
      run('rsync', ['-a', '-e', 'ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30', `${HOST}:${remote}/designs.txt`, `${HOST}:${remote}/results`, `${work}/`]);
      const names = new Set(fs.readFileSync(path.join(work, 'designs.txt'), 'utf8').split('\n').map((l) => l.split(' ')[0]).filter(Boolean));
      designs = manifest.designs.filter((d) => names.has(d.name));
    } else {
      designs = selectDesigns(manifest.designs, filter);
    }
    const fetchable = { ...manifest, designs: designs.map((d) => ({ ...d, files: [...filesOf(d), `${d.dir}/hls_config.cfg`] })) };
    await fetchDesignCorpus({ manifest: fetchable, log: () => {} });

    if (!collect) {
      // the work folder: each design's sources at their repository paths, its config beside its hls_config.cfg
      const list = [];
      for (const d of designs) {
        const dir = sourceDir(manifest.sources[d.source]);
        for (const f of [...filesOf(d), `${d.dir}/hls_config.cfg`]) {
          fs.mkdirSync(path.join(work, 'src', path.dirname(f)), { recursive: true });
          fs.copyFileSync(path.join(dir, f), path.join(work, 'src', f));
        }
        fs.writeFileSync(path.join(work, 'src', d.dir, 'silinx_vitis.cfg'), vitisConfig(fs.readFileSync(path.join(dir, d.dir, 'hls_config.cfg'), 'utf8'), { part }));
        list.push(`${d.name} ${d.dir}`);
      }
      fs.writeFileSync(path.join(work, 'designs.txt'), `${list.join('\n')}\n`);
      fs.copyFileSync(path.join(ROOT, 'scripts', 'vitis-hls-image', 'hls-vitis-run.sh'), path.join(work, 'hls-vitis-run.sh'));
      const docker = ['run', '--rm', ...DOCKER_ISOLATION, '--platform', 'linux/amd64'];
      if (HOST === 'local') run('docker', [...docker, '-v', `${work}:/w`, IMAGE, 'bash', '/w/hls-vitis-run.sh', '/w']);
      else {
        const name = path.basename(work), remote = remoteOf(name);
        const mount = remote.startsWith('/') ? remote : `$HOME/${remote}`;
        ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
        run('rsync', ['-a', '-e', 'ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30', `${work}/`, `${HOST}:${remote}/`]);
        if (a.includes('--detach')) {
          ssh(`docker run -d --name ${name} ${docker.slice(1).join(' ')} -v "${mount}":/w ${IMAGE} bash /w/hls-vitis-run.sh /w`);
          console.log(`${name}: ${designs.length} designs started on the host; collect with: node scripts/hls-vitis.mjs --collect ${name} --update`);
          return;
        }
        try {
          process.stdout.write(ssh(`docker run ${docker.slice(1).join(' ')} -v "${mount}":/w ${IMAGE} bash /w/hls-vitis-run.sh /w`));
          run('rsync', ['-a', '-e', 'ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=30', `${HOST}:${remote}/results/`, `${work}/results/`]);
        } finally { ssh(`rm -rf ${remote}`); }
      }
    }

    // Vitis's results against Silinx's
    const results = {};
    for (const d of designs) {
      const R = path.join(work, 'results', d.name);
      const read = (f) => (fs.existsSync(path.join(R, f)) ? fs.readFileSync(path.join(R, f), 'utf8') : '');
      const syn = parseCsynth(read('csynth.xml')), co = parseCosim(read('cosim.rpt'));
      const vitis = { ...parseStatus(read('status.txt'), read('csim.log')), latency: syn.latency, interval: syn.interval, cosimLatency: co.latency, loops: syn.loops, ports: syn.ports };
      if (co.status === 'fail') vitis.cosim = 'fail';
      const texts = Object.fromEntries(filesOf(d).map((f) => [f, fs.readFileSync(path.join(sourceDir(manifest.sources[d.source]), f), 'utf8')]));
      let silinx;
      try {
        const r = runDesign(d, texts);
        const { unit, headers } = unitOf(d, texts);
        const g = cToHdl(unit, { file: d.language === 'c' ? 'unit.c' : 'unit.cpp', headers, top: d.top, lang: 'vhdl', directives: d.directives });
        silinx = { csim: r.csim, synth: r.synth, cosim: r.cosim, latency: r.latency && { min: r.latency.min, max: r.latency.max }, loops: g.ok ? (g.report.loops || []).map((l) => ({ name: l.name || null, line: l.line, ii: l.ii, cycles: l.cycles })) : [], ports: g.ok ? g.ports.map(({ name, dir, w }) => ({ name, dir, w })) : [] };
      } catch (e) { silinx = { csim: 'fail', synth: 'fail', cosim: 'skip', latency: null, loops: [], ports: [], reason: `exception: ${e.message}` }; }
      results[d.name] = compareDesign(vitis, silinx);
      const p = results[d.name].ports;
      console.log(`${d.name.padEnd(48)} csim ${vitis.csim}/${silinx.csim}  cosim ${vitis.cosim}/${silinx.cosim}  ports ${p ? (p.same ? 'same' : 'DIFFER') : '-'}  latency ${span(vitis.latency)}/${span(silinx.latency)}`);
    }
    if (a.includes('--update')) {
      const FILE = path.join(HLS, 'vitis.json');
      const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).designs : {};
      const all = Object.fromEntries(Object.entries({ ...old, ...results }).sort());
      fs.writeFileSync(FILE, `${JSON.stringify({ image: IMAGE, part, designs: all }, null, 2)}\n`);
      const readme = path.join(HLS, 'README.md');
      const text = fs.readFileSync(readme, 'utf8');
      fs.writeFileSync(readme, text.replace(/<!-- vitis -->[\s\S]*<!-- \/vitis -->/, `<!-- vitis -->\n${vitisTable(manifest, all, { image: IMAGE, part })}\n<!-- /vitis -->`));
      console.log(`test/hls-corpus/vitis.json and the README's Vitis table updated (${designs.length} designs)`);
    }
    if (collect) {
      if (keepsRun(a)) console.log(`${collect}: its results kept on the host; save them with: node scripts/hls-vitis.mjs --collect ${collect} --update`);
      else ssh(`rm -rf ${remoteOf(collect)}`);
    }
  } finally { if (!process.env.SILINX_KEEP) fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
