// #751: the bits of a pad's input delay that ISE sets only when a neighbouring pad is used too. #44 / #97 solved the
// delays from designs where every pad had an input (ri, rb), so a bit that needs two pads went to one of them (the
// XC3S500E's B3 46,31, E17 538,356; the XC3S1200E's B3 47,31, F14 767,740, G13 767,996). Here each group of pads (a
// pad, the pads it may pair with) takes every combination of kinds (n unused, r input register, i direct input,
// o output; an input-only pad no output), one design per combination written by the open flow (open-flow.mjs: the
// pads LOC'd, nothing else on them), and in each design every pair of delay values of the group's first two pads
// (IFD_DELAY_VALUE 0-6, IBUF_DELAY_VALUE 0-12; the third pad's value with the first's), written as ISE's map writes
// them (gen-iobrand.mjs setDelay). The groups of a device take their combinations side by side (each in turn).
// ISE's xdl -xdl2ncd + bitgen on every variant (fuzz-remote.sh), then ana-pairdly.mjs.
//   PART=xc3s500efg320-4 node gen-pairdly.mjs outdir [--groups B3,A3/D18,E17] [--kinds rin] [--third nr] [--nodelay]
// (--kinds: the kinds tried, default rino; --third: the third pad's, default n (unused); --nodelay: each pad at its
// kind's default delay only, DLY3 / none)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setDelay } from './gen-iobrand.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = n => { const i = args.indexOf(n); if (i >= 0) args.splice(i, 1); return i >= 0; };
const PART = process.env.PART || 'xc3s500efg320-4';
// the groups of each device (#751): an input-only pad (an IBUFS tile's) and the pads of the I/O tile next to it
export const GROUPS = {
  'xc3s500efg320-4': [['B3', 'A3', 'C3'], ['D18', 'E17']],
  'xc3s1200efg320-4': [['B3', 'A3', 'C3'], ['E17', 'F14', 'F15'], ['E18', 'G13', 'G14']],
};
// the input-only pads (IBUF sites) of the groups
const INPUT_ONLY = { 'xc3s500efg320-4': ['A3', 'D18'], 'xc3s1200efg320-4': ['A3', 'E17', 'E18'] };
const groupsOpt = opt('--groups', null), kindsOpt = opt('--kinds', 'rino'), thirdOpt = opt('--third', 'n'), nodelay = flag('--nodelay');
const groups = groupsOpt ? groupsOpt.split('/').map(g => g.split(',')) : GROUPS[PART] || [];
const [out] = args;
// the clock pad (a global clock pin) and the output pad of the designs, per package
export const CLK = { cp132: 'B8', fg320: 'C9' }, Q = { cp132: 'M5', fg320: 'J14' };

// the kinds a pad may take; the combinations of a group (not every pad unused); the third pad's kinds --third
const kindsOf = (pad, j) => [...(j >= 2 ? thirdOpt : kindsOpt.includes('n') ? kindsOpt : `n${kindsOpt}`)].filter(k => !(k === 'o' && INPUT_ONLY[PART]?.includes(pad)));
const combos = g => g.reduce((acc, pad, j) => acc.flatMap(c => kindsOf(pad, j).map(k => [...c, k])), [[]]).filter(c => c.some(k => k !== 'n'));
const groupCombos = groups.map(combos);
const nDesigns = Math.max(...groupCombos.map(c => c.length));
const delays = k => (nodelay ? [k === 'r' ? 3 : 0] : k === 'r' ? [0, 1, 2, 3, 4, 5, 6] : k === 'i' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [null]);

/** A design: every pad of kinds ([pad, kind]…) with its kind; the inputs into one output (q, through a register in a
 *  slice), written as a project (top.vhd, top.ucf, silinx.json) in dir; the clock and q on the package's CLK and Q
 *  pads, or on clk and q. */
export function project(dir, kinds, part = PART, { clk = null, q = null } = {}) {
  const [, device, pkg, speed] = /^(xc3s\d+e)([a-z]+\d+)(-\d)$/.exec(part);
  const ports = [], regs = [], ins = [], outs = [], ucf = [`NET "clk" LOC = "${clk || CLK[pkg]}" | IOSTANDARD = LVCMOS25 ;`];
  for (const [pad, k] of kinds) {
    if (k === 'n') continue;
    const s = `p_${pad.toLowerCase()}`;
    ports.push(`${s} : ${k === 'o' ? 'out' : 'in'} std_logic`);
    ucf.push(`NET "${s}" LOC = "${pad}" | IOSTANDARD = LVCMOS25 ;`, `NET "${s}" IOB = ${k === 'r' || k === 'o' ? 'TRUE' : 'FALSE'} ;`);
    (k === 'r' ? regs : k === 'i' ? ins : outs).push(s);
  }
  ucf.push(`NET "q" LOC = "${q || Q[pkg]}" | IOSTANDARD = LVCMOS25 ;`, 'NET "q" IOB = FALSE ;');
  const vhd = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
entity top is
  port (clk : in std_logic;${ports.map(p => `\n        ${p};`).join('')}
        q : out std_logic);
end top;
architecture rtl of top is
  signal r : std_logic_vector(${Math.max(regs.length, 1) - 1} downto 0) := (others => '0');
  signal cnt : unsigned(7 downto 0) := (others => '0');
  signal s : std_logic := '0';
begin
  process (clk) begin
    if rising_edge(clk) then
${regs.map((p, i) => `      r(${i}) <= ${p};\n`).join('')}      cnt <= cnt + 1;
      s <= ${[...regs.map((p, i) => `r(${i})`), ...ins, 'cnt(7)'].join(' xor ')};
    end if;
  end process;
${outs.map((p, i) => `  ${p} <= cnt(${i});\n`).join('')}  q <= s;
end rtl;
`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'top.vhd'), vhd);
  fs.writeFileSync(path.join(dir, 'top.ucf'), `${ucf.join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'top', version: 1, device: { family: 'spartan3e', part: device, package: pkg, speed }, top: 'top', files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: 'top.ucf', impl: { startupClk: 'JtagClk' } }, null, 2));
}

/** The open flow on a project (open-flow.mjs): its routed.xdl, in dir/flow. */
export function openFlow(dir) {
  if (fs.existsSync(path.join(dir, 'flow', 'routed.xdl'))) return fs.readFileSync(path.join(dir, 'flow', 'routed.xdl'), 'utf8');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'flow')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${dir}: open flow failed\n${r.stderr.slice(-2000)}`);
  return fs.readFileSync(path.join(dir, 'flow', 'routed.xdl'), 'utf8');
}
/** An XDL with the input delays vals ({ site: value }) set as ISE's map writes them. */
export const withDelays = (text, vals) => text.replace(/(inst "[^"]*" "(?:IOB|IBUF)",placed \S+ (\S+)\s*,\s*cfg ")([^"]*)(")/g, (s, a, site, cfg, b) => (site in vals && vals[site] !== null ? a + setDelay(cfg, vals[site]) + b : s));

const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
const key = { part: PART, groups, designs: {} };
let total = 0;
for (let d = 0; main && d < nDesigns; d++) {
  const name = `D${String(d).padStart(2, '0')}`;
  const kinds = groups.flatMap((g, i) => g.map((pad, j) => [pad, groupCombos[i][d % groupCombos[i].length][j]]));
  const proj = path.join(out, 'proj', name), dir = path.join(out, name);
  if (!fs.existsSync(path.join(proj, 'flow', 'routed.xdl'))) project(proj, kinds);
  const text = openFlow(proj);
  // the variants: every pair of values of each group's first two pads
  const per = groups.map((g, i) => {
    const c = groupCombos[i][d % groupCombos[i].length], a = delays(c[0]), b = delays(c[1]);
    return { g, c, a, b, n: a.length * b.length };
  });
  const nv = Math.max(...per.map(p => p.n));
  fs.mkdirSync(dir, { recursive: true });
  key.designs[name] = { kinds: Object.fromEntries(kinds), variants: {} };
  for (let v = 0; v < nv; v++) {
    const vals = {};
    for (const { g, c, a, b, n } of per) {
      const w = v % n, x = a[w % a.length], y = b[Math.floor(w / a.length)];
      g.forEach((pad, j) => { const k = c[j]; if (k === 'r' || k === 'i') vals[pad] = j === 0 ? x : j === 1 ? y : x ?? 3; });
    }
    const t = withDelays(text, vals);
    const vn = `V${String(v).padStart(3, '0')}`;
    fs.writeFileSync(path.join(dir, `${vn}.xdl`), t);
    key.designs[name].variants[vn] = vals;
    total++;
  }
}
if (main) {
  fs.writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1));
  console.log(`${PART}: ${nDesigns} designs, ${total} variants in ${out}`);
}
