// The page for users of the comparison of the Silinx toolchain with ISE (docs/QUALITY.md), from the
// results of test/designs-corpus/compare-ise.mjs (ise-comparison.json).
const fmt = (v, d = 0) => (v == null ? '–' : typeof v === 'number' ? v.toFixed(d) : String(v));
const ratio = (a, b) => (a != null && b ? a / b : null);
const geomean = xs => (xs.length ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) : null);
const pct = g => (g == null ? '–' : `${g >= 1 ? '+' : '−'}${Math.abs((g - 1) * 100).toFixed(0)}%`);
const XST_CANNOT = /^ERROR:(HDL|Xst)/;
// a Markdown code span, also of a text with backticks in it
const code = t => (t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``);

// the EPFL benchmarks mapped to 6-input LUTs against the best-known results (#367, research/epfl-records): their
// section, from that measurement's results and records
function epflSection(epfl) {
  const { records, results } = epfl;
  const rows = Object.entries(records.benchmarks).filter(([n]) => results[n]);
  if (!rows.length) return [];
  const num = (m, k) => (m && !m.error && Number.isFinite(m[k]) ? m[k] : null);
  const gSize = geomean(rows.map(([n, r]) => ratio(num(results[n].area, 'luts'), r.size.luts)).filter(x => x));
  const gDepth = geomean(rows.map(([n, r]) => ratio(num(results[n].depth, 'levels'), r.depth.levels)).filter(x => x));
  const L = ['', '## Against the best-known results (EPFL benchmarks, LUT-6)', ''];
  L.push('The [EPFL combinational benchmarks](https://github.com/lsils/benchmarks) keep the best results of a logic',
    'synthesis competition, in 6-input LUTs: the fewest LUTs (size) and the fewest levels of LUTs (depth). The',
    'Spartan-3E has 4-input LUTs, so the table above does not compare with them; here Silinx\'s front end and its',
    'Yosys / ABC mapping (packages/silinx-fpga/src/synth-open.js) map each benchmark to LUT-6: *area*, ABC\'s default LUT mapping, against',
    'the size record; *depth*, the logic balanced first as Silinx\'s depth-oriented mapping does, against the depth',
    `record (geometric means: LUTs ${fmt(gSize, 2)}× the size records, levels ${fmt(gDepth, 2)}× the depth records; the`,
    'records come from exact SAT-based resynthesis and long optimization runs, the targets of research, not of a',
    `synthesis tool in seconds). Records: the ${records.source.file} of lsils/benchmarks at ${records.source.commit.slice(0, 7)}.`, '');
  L.push('| benchmark | LUT-6 (area) | levels | best LUTs | LUTs / best | LUT-6 (depth) | levels | best levels | levels / best |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [n, r] of rows) {
    const a = results[n].area, d = results[n].depth;
    const cell = (m, k) => (m?.error ? (k === 'luts' ? 'not mapped' : '–') : fmt(num(m, k)));
    L.push(`| ${n} | ${cell(a, 'luts')} | ${cell(a, 'levels')} | ${r.size.luts} | ${fmt(ratio(num(a, 'luts'), r.size.luts), 2)} | ${cell(d, 'luts')} | ${cell(d, 'levels')} | ${r.depth.levels} | ${fmt(ratio(num(d, 'levels'), r.depth.levels), 2)} |`);
  }
  L.push('', 'Measured by `node research/epfl-records/measure.mjs` (research/epfl-records/results.json), by hand when the',
    'synthesis changes.');
  return L;
}

// the critical paths' breakdown (#646), when the comparison measured it: each flow's levels of logic and its
// logic (LUTs, carry chains, flip-flops) and routing delays, and what the difference with ISE's is made of
function pathSection(rows, hasHigh) {
  const sides = hasHigh ? [['silinx', 'Silinx'], ['silinxHigh', 'High'], ['ise', 'ISE']] : [['silinx', 'Silinx'], ['ise', 'ISE']];
  const withPath = rows.filter(r => sides.some(([k]) => r[k]?.path));
  if (!withPath.length) return [];
  const L = ['', '### The critical paths: logic and routing', ''];
  L.push('Each critical path above as trce details it: its levels of logic, its logic delay (the LUTs, the carry',
    'chains, the flip-flops\' clock to out and setup; *LUT*, *carry*: the LUTs\' and the carry chains\' share of it)',
    'and its routing delay (ns). More levels or LUT delay than ISE\'s: the synthesis; more routing: the placement',
    'and the routing.', '');
  // the difference with ISE's of the designs slower than ISE, split in logic and routing
  for (const [k, label] of sides.slice(0, -1)) {
    const slow = rows.filter(r => r[k]?.path && r.ise?.path && r[k].periodNs > r.ise.periodNs);
    if (!slow.length) continue;
    const dl = slow.reduce((t, r) => t + r[k].path.logic - r.ise.path.logic, 0), dr = slow.reduce((t, r) => t + r[k].path.route - r.ise.path.route, 0);
    const sgn = x => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} ns`;
    L.push(`- ${label}: ${slow.length} design${slow.length > 1 ? 's' : ''} slower than ISE; against ISE's critical paths, on average, logic`,
      `  ${sgn(dl / slow.length)}, routing ${sgn(dr / slow.length)}.`);
  }
  if (L.at(-1) !== '') L.push('');
  const cols = ['levels', 'logic', 'LUT', 'carry', 'route'];
  L.push(`| design | ${cols.flatMap(c => sides.map(([, l]) => `${c} ${l}`)).join(' | ')} |`, `|---|${cols.flatMap(() => sides.map(() => '---:')).join('|')}|`);
  const val = (p, c) => (c === 'levels' ? fmt(p?.levels) : fmt(p?.[c.toLowerCase()], 2));
  for (const r of withPath) L.push(`| ${r.name} | ${cols.flatMap(c => sides.map(([k]) => val(r[k]?.path, c))).join(' | ')} |`);
  return L;
}

export function qualityPage(res, { epfl = null } = {}) {
  const rows = res.designs;
  const both = rows.filter(r => r.silinx?.luts && r.ise?.luts);
  const packed = rows.filter(r => r.silinx?.slices && r.ise?.slices);
  const timed = rows.filter(r => r.silinx?.periodNs && r.ise?.periodNs);
  const gLuts = geomean(both.map(r => r.silinx.luts / r.ise.luts));
  const gFfs = geomean(both.filter(r => r.silinx.ffs && r.ise.ffs).map(r => r.silinx.ffs / r.ise.ffs));
  const gSlices = geomean(packed.map(r => r.silinx.slices / r.ise.slices));
  const gPeriod = geomean(timed.map(r => r.silinx.periodNs / r.ise.periodNs));
  const xstCannot = rows.filter(r => XST_CANNOT.test(r.ise?.error || '')).length;
  const smaller = both.filter(r => r.silinx.luts <= r.ise.luts).length;
  const faster = timed.filter(r => r.silinx.periodNs <= r.ise.periodNs).length;
  // Silinx at its Optimization Effort High too (#377), when the comparison measured it: its columns and lines
  const hasHigh = rows.some(r => r.silinxHigh);
  const bothH = rows.filter(r => r.silinxHigh?.luts && r.ise?.luts);
  const timedH = rows.filter(r => r.silinxHigh?.periodNs && r.ise?.periodNs);
  const gLutsH = geomean(bothH.map(r => r.silinxHigh.luts / r.ise.luts));
  const gSlicesH = geomean(rows.filter(r => r.silinxHigh?.slices && r.ise?.slices).map(r => r.silinxHigh.slices / r.ise.slices));
  const gPeriodH = geomean(timedH.map(r => r.silinxHigh.periodNs / r.ise.periodNs));
  const fasterH = timedH.filter(r => r.silinxHigh.periodNs <= r.ise.periodNs).length;
  const L = [];
  L.push('# Quality of the Silinx toolchain against Xilinx ISE', '');
  L.push('How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx\'s',
    'pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are',
    'the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,',
    'crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),',
    'with the same top (a design with more ports than the package has pins goes through the same I/O',
    'wrapper in both).', '');
  L.push(`Measured ${res.generatedAt.slice(0, 10)} (Silinx ${res.silinxVersion}, ISE 14.7), with`,
    '`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as',
    `tightly as it can (\`-c 1\`, as Silinx's packer always does) and the clock constraint is tightened to`,
    `${res.isePeriodNs ?? 5} ns, so that its place and route works for speed (ISE stops improving once a constraint`,
    'is met; the Silinx toolchain always places and routes for speed).', '');
  if (hasHigh) L.push('Silinx is built at its two Optimization Efforts (Process Properties of *Synthesize*): **Normal**, the',
    'default (one mapping, the faster synthesis; since 15.11.1 also the mappings for speed of a deep design and of wide multiplexers, and the one with the wider functions), and **High**',
    '(the mappings for speed for every design, the faster circuit); ISE at its default. *Silinx* in the tables is Normal,',
    '*High* the other.', '');
  L.push('## Summary', '');
  L.push(`- **Size:** ${both.length} designs built by both. Logic LUTs: Silinx ${pct(gLuts)} against ISE; flip-flops`,
    `  ${pct(gFfs)}; slices ${pct(gSlices)} (geometric means of the ratios; below 0: Silinx is smaller). Silinx`,
    `  needs as few LUTs or fewer on ${smaller} of ${both.length}.`);
  L.push(`- **Speed:** ${timed.length} designs timed by both. Critical path: Silinx ${pct(gPeriod)} against ISE`,
    `  (above 0: Silinx is slower); Silinx is as fast or faster on ${faster} of ${timed.length}. Both critical`,
    '  paths are measured by ISE\'s timing analyser (trce) on the routed design.');
  if (hasHigh) L.push(`- **At Optimization Effort High:** logic LUTs ${pct(gLutsH)}, slices ${pct(gSlicesH)} against ISE (${bothH.length} designs);`,
    `  critical path ${pct(gPeriodH)}, as fast or faster on ${fasterH} of ${timedH.length}.`);
  if (xstCannot) L.push(`- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read ${xstCannot} of the designs (\`$clog2\`, VHDL-2008`,
    '  and other constructs it predates, listed below); Silinx reads them.');
  L.push('- These numbers are tracked to improve the Silinx toolchain (the GitHub',
    '  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).', '');
  L.push('## Size', '');
  L.push('4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices',
    'after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the',
    'ratio of logic LUTs (below 1: Silinx is smaller).', '');
  if (hasHigh) {
    L.push('| design | LUTs Silinx | LUTs High | LUTs ISE | S / I | H / I | FFs Silinx | FFs ISE | slices Silinx | slices High | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  } else {
    L.push('| design | LUTs Silinx | LUTs ISE | S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  }
  for (const r of rows) {
    const s = r.silinx || {}, i = r.ise || {}, hi = r.silinxHigh || {};
    if (hasHigh) L.push(`| ${r.name} | ${fmt(s.luts)} | ${fmt(hi.luts)} | ${fmt(i.luts)} | ${fmt(ratio(s.luts, i.luts), 2)} | ${fmt(ratio(hi.luts, i.luts), 2)} | ${fmt(s.ffs)} | ${fmt(i.ffs)} | ${fmt(s.slices)} | ${fmt(hi.slices)} | ${fmt(i.slices)} | ${fmt(s.srl16)} / ${fmt(i.srl16)} | ${fmt(s.bram)} / ${fmt(i.bram)} | ${fmt(s.mult)} / ${fmt(i.mult)} |`);
    else L.push(`| ${r.name} | ${fmt(s.luts)} | ${fmt(i.luts)} | ${fmt(ratio(s.luts, i.luts), 2)} | ${fmt(s.ffs)} | ${fmt(i.ffs)} | ${fmt(s.slices)} | ${fmt(i.slices)} | ${fmt(s.srl16)} / ${fmt(i.srl16)} | ${fmt(s.bram)} / ${fmt(i.bram)} | ${fmt(s.mult)} / ${fmt(i.mult)} |`);
  }
  L.push('', '## Speed', '');
  L.push('The critical path of the routed design (the minimum clock period, or the longest path of a',
    'design without a clock; ns, shorter is faster), both by ISE\'s trce. *Silinx estimate*: Silinx\'s own',
    'timing analysis (what its Design Summary shows).', '');
  if (hasHigh) {
    L.push('| design | Silinx (trce) | High (trce) | ISE (trce) | S / I | H / I | Silinx estimate | High estimate |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  } else {
    L.push('| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate |');
    L.push('|---|---:|---:|---:|---:|');
  }
  for (const r of rows) {
    const s = r.silinx || {}, i = r.ise || {}, hi = r.silinxHigh || {};
    if (!s.periodNs && !i.periodNs && !s.estimateNs && !hi.periodNs) continue;
    if (hasHigh) L.push(`| ${r.name} | ${fmt(s.periodNs, 2)} | ${fmt(hi.periodNs, 2)} | ${fmt(i.periodNs, 2)} | ${fmt(ratio(s.periodNs, i.periodNs), 2)} | ${fmt(ratio(hi.periodNs, i.periodNs), 2)} | ${fmt(s.estimateNs, 2)} | ${fmt(hi.estimateNs, 2)} |`);
    else L.push(`| ${r.name} | ${fmt(s.periodNs, 2)} | ${fmt(i.periodNs, 2)} | ${fmt(ratio(s.periodNs, i.periodNs), 2)} | ${fmt(s.estimateNs, 2)} |`);
  }
  L.push(...pathSection(rows, hasHigh));
  const notes = rows.filter(r => r.silinx?.error || r.silinxHigh?.error || r.ise?.error);
  if (notes.length || res.notBuilt?.length) {
    L.push('', '## Not built by one of the flows', '');
    for (const r of notes) {
      if (r.silinx?.error) L.push(`- ${r.name}, Silinx: ${code(r.silinx.error)}`);
      if (r.silinxHigh?.error && r.silinxHigh.error !== r.silinx?.error) L.push(`- ${r.name}, Silinx at effort High: ${code(r.silinxHigh.error)}`);
      if (r.ise?.error) L.push(XST_CANNOT.test(r.ise.error) ? `- ${r.name}: XST cannot read it (${code(r.ise.error)}); Silinx reads it.` : `- ${r.name}, ISE: ${code(r.ise.error)}`);
    }
    if (res.notBuilt?.length) L.push(`- ${res.notBuilt.join(', ')}: Silinx cannot read or synthesize ${res.notBuilt.length > 1 ? 'them' : 'it'} yet (the design corpus's [results](../test/designs-corpus/README.md)), so neither flow was compared.`);
  }
  // designs added to the corpus after this comparison (#366, #372): in the next one
  if (res.pending?.length) {
    L.push('', '## Added after this comparison', '');
    L.push(`${res.pending.join(', ')}: added to the design corpus after this comparison was run; the next weekly run compares ${res.pending.length > 1 ? 'them' : 'it'} too.`);
  }
  if (epfl) L.push(...epflSection(epfl));
  L.push('', '## How it is measured', '');
  L.push('`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx',
    'project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE',
    'from its Docker image, both flows on the same machine) and writes `test/designs-corpus/ise-comparison.json`',
    'and this page. It runs every week on a self-hosted runner with ISE (`.github/workflows/quality.yml`),',
    'which pushes the new results to the branch `quality-results` (merged into main by a maintainer), and',
    'by hand (Actions ▸ Quality ▸ Run workflow). The corpus\'s nightly',
    'run checks the Silinx toolchain on every design without ISE.', '');
  return L.join('\n');
}
