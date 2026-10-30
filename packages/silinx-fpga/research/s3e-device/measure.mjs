// #3, the XC3S250E's recipe (README sections 6-15) for another Spartan-3E die, in stages run one after the other:
//   designs  every observation design ISE implements (gen-obshdl, gen-obscarry, gen-obsslice, gen-obsmux, gen-obspins,
//            gen-obspins2, gen-obsclk), sized to the part, in one folder of design folders for impl-remote.sh;
//   observe  what ISE's routes of the implemented ones show (prototype.mjs observe, INTERSECT=1), and the designs ISE
//            did not implement (their folder has no top.xdl), named.
//   tiles    the tile probe (candidates.mjs tiles, probe-run.mjs): the tiles that hold a switch box, seen in ISE's routes
//            or found by the probe (switch-tiles.txt), and the CLBs among them (clb-tiles.txt).
//   random   the random designs ISE routes keeping their placement (gen-observe.mjs: 4 designs, seed 11, a quarter of
//            the CLBs each, as the XC3S250E's), for ise-remote.sh -r; observe then reads their routes too (routed-dir).
//   round k  the join tests' round k (prototype.mjs predict, SEG=1, then tests), across the joins rounds 1 to k-1
//            confirmed, in work/t<k> for ise-remote.sh -f; verdicts k reads ISE's DRC (prototype.mjs verdicts) and says
//            whether round k found joins (another round) or none (the CLB array's rounds done). MAXJOINS, MAXDEPTH,
//            SOURCES… pass through to tests (the XC3S250E's rounds 4-8: README section 6).
// The later stages (the I/O and clock probes, chip and compare) follow as the XC3S100E is measured.
//   PART=xc3s100ecp132-4 node measure.mjs designs dir
//   (ISE: W=dir PART=xc3s100e-cp132-4 SILINX_FUZZ_HOST=… research/s3e-bitstream/impl-remote.sh -P 1 $(ls dir))
//   PART=xc3s100ecp132-4 SILINX_ISE_HOST=… RWBASE=… node measure.mjs tiles obs.json work-dir   (ISE: the arc probe)
//   PART=xc3s100ecp132-4 node measure.mjs random work-dir/clb-tiles.txt rand
//   (ISE: SILINX_ISE_HOST=… RWBASE=… ise-remote.sh -r rand)
//   PART=xc3s100ecp132-4 node measure.mjs observe dir work-dir/obs.json rand
//   PART=xc3s100ecp132-4 node measure.mjs round work-dir 1      (ISE: ise-remote.sh -f work-dir/t1)
//   PART=xc3s100ecp132-4 node measure.mjs verdicts work-dir 1   (then round 2, … until a round finds no join)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = process.env.PART || 'xc3s250ecp132-4';

/** The observation generators, in the XC3S250E's order, each with its arguments (none: the part's defaults). */
export const GENERATORS = ['gen-obshdl', 'gen-obscarry', 'gen-obsslice', 'gen-obsmux', 'gen-obspins', 'gen-obspins2', 'gen-obsclk'];

/** Every observation design of `part` in `dir` (one folder per design, top.v and top.ucf); the names of the designs. A
 *  name two generators both write is refused. */
export function observationDesigns(part, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-measure-'));
  const names = [];
  try {
    for (const g of GENERATORS) {
      const out = path.join(tmp, g);
      execFileSync(process.execPath, [path.join(HERE, `${g}.mjs`), out], { env: { ...process.env, PART: part }, stdio: 'pipe' });
      for (const d of fs.readdirSync(out).sort()) {
        if (names.includes(d) || fs.existsSync(path.join(dir, d))) throw new Error(`measure: design ${d} of ${g} written twice`);
        fs.cpSync(path.join(out, d), path.join(dir, d), { recursive: true });
        names.push(d);
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return names;
}

/** The designs of `dir` ISE implemented (a top.xdl) and the ones it did not. */
export function implemented(dir) {
  const all = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'top.v')) || fs.existsSync(path.join(dir, d, 'top.vhd'))).sort();
  const done = all.filter(d => fs.existsSync(path.join(dir, d, 'top.xdl')));
  return { done, missing: all.filter(d => !done.includes(d)) };
}

/** The switch-box tiles (the ones ISE's routes showed, and the ones the tile probe found: a PIP accepted in them) and
 *  the CLBs among them, in code-unit order as the XC3S250E's switch-tiles.txt. */
export function tileLists(known, probeYes) {
  const all = [...new Set([...known, ...probeYes.map(p => p.tile)])].sort();
  return { switchTiles: all, clbTiles: all.filter(t => t.startsWith('CLB_')) };
}

/** Round k's files in `work`: its predictions, its test folder, and the earlier rounds' folders, whose confirmed joins
 *  it crosses and does not test again. */
export function roundPaths(work, k) {
  if (!Number.isInteger(k) || k < 1) throw new Error(`measure: round ${k} is not a round (1, 2, …)`);
  return { pred: path.join(work, `pred${k}.json`), dir: path.join(work, `t${k}`), tested: Array.from({ length: k - 1 }, (_, i) => path.join(work, `t${i + 1}`)) };
}

/** ISE's verdicts of a round (prototype.mjs verdicts: [a, b, verdict]): joins, islands, the others (not run, …), and
 *  whether another round is needed (the round found joins: they make the next round's paths). */
export function roundSummary(verdicts) {
  const n = { join: 0, island: 0, other: 0 };
  for (const [, , v] of verdicts) n[v === 'join' ? 'join' : v === 'no-join' ? 'island' : 'other']++;
  return { ...n, again: n.join > 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, dir, out, ...rest] = process.argv.slice(2);
  if (cmd === 'designs') {
    const names = observationDesigns(PART, dir);
    console.log(`${PART}: ${names.length} designs in ${dir}: ${names.join(' ')}`);
  } else if (cmd === 'random') {
    execFileSync(process.execPath, [path.join(HERE, 'gen-observe.mjs'), dir, out, '4', '11', '0.25', PART], { stdio: 'inherit' });
  } else if (cmd === 'observe') {
    const { done, missing } = implemented(dir);
    if (missing.length) console.log(`not implemented by ISE (no top.xdl): ${missing.join(' ')}`);
    // (routed-dir…: the random designs ISE routed, ise-remote.sh -r: their *.r.xdl)
    const routed = rest.flatMap(r => fs.readdirSync(r).filter(f => f.endsWith('.r.xdl')).sort().map(f => path.join(r, f)));
    execFileSync(process.execPath, [path.join(HERE, 'prototype.mjs'), 'observe', out, ...done.map(d => path.join(dir, d, 'top.xdl')), ...routed],
      { env: { ...process.env, PART, INTERSECT: '1' }, stdio: 'inherit' });
  } else if (cmd === 'tiles') {
    const [obsFile, work] = [dir, out];
    fs.mkdirSync(work, { recursive: true });
    const run = (f, args) => execFileSync(process.execPath, [path.join(HERE, f), ...args], { env: { ...process.env, PART }, stdio: 'inherit' });
    run('candidates.mjs', ['tiles', obsFile, path.join(work, 'tile-cand.json')]);
    run('probe-run.mjs', [path.join(work, 'tile-cand.json'), path.join(work, 'tile-probe.json'), path.join(work, 'tile-probe')]);
    const cand = JSON.parse(fs.readFileSync(path.join(work, 'tile-cand.json'), 'utf8'));
    const res = JSON.parse(fs.readFileSync(path.join(work, 'tile-probe.json'), 'utf8'));
    const { switchTiles, clbTiles } = tileLists(cand.known, res.pips.yes);
    fs.writeFileSync(path.join(work, 'switch-tiles.txt'), switchTiles.join('\n') + '\n');
    fs.writeFileSync(path.join(work, 'clb-tiles.txt'), clbTiles.join('\n') + '\n');
    console.log(`${switchTiles.length} switch-box tiles (${cand.known.length} seen, ${res.pips.yes.length} found by the probe, ${res.pips.no.length} refused), ${clbTiles.length} CLBs`);
  } else if (cmd === 'round') {
    const p = roundPaths(dir, +out), proto = path.join(HERE, 'prototype.mjs'), obs = path.join(dir, 'obs.json');
    const run = (args, env = {}) => execFileSync(process.execPath, [proto, ...args], { env: { ...process.env, PART, ...env }, stdio: 'inherit' });
    run(['predict', obs, path.join(dir, 'switch-tiles.txt'), p.pred, ...p.tested], { SEG: '1' });
    run(['tests', p.pred, obs, p.dir, ...p.tested]);
  } else if (cmd === 'verdicts') {
    const p = roundPaths(dir, +out);
    execFileSync(process.execPath, [path.join(HERE, 'prototype.mjs'), 'verdicts', p.dir], { env: { ...process.env, PART }, stdio: 'inherit' });
    const s = roundSummary(JSON.parse(fs.readFileSync(path.join(p.dir, 'verdicts.json'), 'utf8')));
    console.log(`round ${out}: ${s.join} joins, ${s.island} islands, ${s.other} others: ${s.again ? `round ${+out + 1} next` : 'no join found: the rounds are done'}`);
  } else {
    console.error('usage: node measure.mjs designs dir | observe dir obs.json [routed-dir…] | tiles obs.json work-dir | random clb-tiles.txt dir | round work-dir k | verdicts work-dir k');
    process.exit(2);
  }
}
