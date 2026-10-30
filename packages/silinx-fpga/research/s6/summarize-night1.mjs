// Night 1's results (#733) as Silinx's own record, research/s6/measured/night1.json: counts and
// observations only, no Xilinx file. From the work folder that night1-remote.sh copied back:
//   per board and example, from the HDL (impl-*) and from the open synthesis's netlist (edif-*): map's
//   counts (top_map.mrp), the slices by kind in map's XDL (SLICEX / SLICEL / SLICEM), whether par routed
//   every signal, trce's minimum period, the steps' times;
//   per part: the empty design's packets (bits6.mjs), with and without CRC; the device report's summary,
//   tile and site types.
//
//   node research/s6/summarize-night1.mjs <work folder> [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, packetLine } from './bits6.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

/** map's report: { 'Slice Registers': { used, of }, 'occupied Slices': …, 'used as Flip Flops': { used } } ("Number of X: n out of m",
 *  "Number used as X: n"; the first line of each). */
export function mapCounts(mrp) {
  const out = {};
  for (const m of String(mrp || '').matchAll(/^\s*Number (?:of )?([^:\n]+?):\s+([\d,]+)(?:\s+out of\s+([\d,]+))?/gm)) {
    const n = s => Number(s.replace(/,/g, ''));
    if (!(m[1] in out)) out[m[1]] = m[3] ? { used: n(m[2]), of: n(m[3]) } : { used: n(m[2]) };
  }
  return out;
}

/** The instances of an XDL design by type: { SLICEX: n, SLICEL: n, SLICEM: n, IOB: n, … }. */
export function xdlSiteTypes(xdl) {
  const out = {};
  for (const m of String(xdl || '').matchAll(/^inst\s+"[^"]*"\s+"([A-Za-z0-9_]+)"/gm)) out[m[1]] = (out[m[1]] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** trce's minimum period (ns) or null; par's "All signals are completely routed". */
export const minPeriod = twr => { const m = /Minimum period:\s+([\d.]+)ns/.exec(String(twr || '')); return m ? Number(m[1]) : null; };
export const routed = par => /All signals are completely routed/.test(String(par || ''));
/** times.txt: { step: seconds }. */
export const times = txt => Object.fromEntries(String(txt || '').trim().split('\n').filter(Boolean).map(l => { const i = l.lastIndexOf(' '); return [l.slice(0, i), Number(l.slice(i + 1))]; }));

/** The device report's summary file (ise-s6.sh report): { summary: { tiles, sites, … }, tiles: { type: n }, sites: { type: n } }. */
export function reportSummary(txt) {
  const out = { summary: {}, tiles: {}, sites: {} };
  let sect = null;
  for (const l of String(txt || '').split('\n')) {
    if (/^\(summary/.test(l)) for (const m of l.matchAll(/(\w+)=(\d+)/g)) out.summary[m[1]] = Number(m[2]);
    else if (l === '# tile types') sect = 'tiles';
    else if (l === '# site types') sect = 'sites';
    else { const m = /^\s*(\d+)\s+(\S+)$/.exec(l); if (m && sect) out[sect][m[2]] = Number(m[1]); }
  }
  return out;
}

/** One example's results in a folder of ise-s6.sh. */
export function designResults(dir) {
  return {
    map: mapCounts(read(path.join(dir, 'top_map.mrp'))),
    sites: xdlSiteTypes(read(path.join(dir, 'top_map.xdl'))),
    routed: routed(read(path.join(dir, 'par.log'))),
    minPeriod: minPeriod(read(path.join(dir, 'top.twr'))),
    times: times(read(path.join(dir, 'times.txt'))),
  };
}

export function summarize(work) {
  const manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'), 'utf8'));
  const out = { stage: 'S6-0', ise: 'ISE 14.7', boards: {}, parts: {} };
  for (const [board, b] of Object.entries(manifest.boards)) {
    out.boards[board] = { part: b.part, examples: {} };
    for (const name of Object.keys(b.examples)) {
      out.boards[board].examples[name] = {
        unmatched: b.examples[name].unmatched,
        hdl: designResults(path.join(work, `impl-${board}`, name)),
        open: designResults(path.join(work, `edif-${board}`, name)),
      };
    }
  }
  for (const part of manifest.empty) {
    const p = out.parts[part] = {};
    for (const [k, f] of [['empty', `${part}.bit`], ['emptyCrc', `${part}.crc.bit`]]) {
      const file = path.join(work, 'empty', f);
      if (!fs.existsSync(file)) continue;
      const r = readBit6(fs.readFileSync(file));
      p[k] = { header: r.header, packets: r.packets.map(packetLine), fdriWords: r.fdri.length, bytes: fs.statSync(file).size };
    }
    const sum = read(path.join(work, 'reports', `${part.replace(/-(?=[a-z])/, '')}.summary.txt`));
    if (sum) p.report = reportSummary(sum);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [work, outFile = path.join(HERE, 'measured', 'night1.json')] = process.argv.slice(2);
  if (!work) { console.error('usage: node research/s6/summarize-night1.mjs <work folder> [out.json]'); process.exit(2); }
  const s = summarize(path.resolve(work));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(s, null, 1)}\n`);
  for (const [b, x] of Object.entries(s.boards)) for (const [n, e] of Object.entries(x.examples))
    console.log(`${b} ${n}: ISE ${e.hdl.map['occupied Slices']?.used ?? '?'} slices, open ${e.open.map['occupied Slices']?.used ?? '?'} (${JSON.stringify(e.open.sites)})`);
  console.log(`-> ${outFile}`);
}
