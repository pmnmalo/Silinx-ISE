// Designs with an IOB's second flip-flop alone (#759): the two IOBs of a differential pair (DIFFM / DIFFS) share
// each clock wire of their I/O tile, and ISE's map puts the DIFFM's register on its second flip-flop (IFF2 / OFF2 /
// TFF2, clocked by ICLK2 / OTCLK2) when both pads have a register of one kind on different clocks (#749). Here every
// pair of the device has such registers: the DIFFS's on clk (the clock pad's global buffer), the DIFFM's on ck2 (a
// global buffer driven by a counter's bit), to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh), varied
// at random (gen-iobrand.mjs) and solved against the bit database (ana-iobreg.mjs --known).
//   PART=xc3s500efg320-4 node gen-iobpair.mjs outdir [--clk B8]
// Writes outdir/rpi0-3 (every pair two input registers; the registers' kinds, as gen-iobreg.mjs's, moved by k pairs)
// and outdir/rpo0-3 (every pair that can drive outputs two output registers, two output-enable registers with direct
// outputs, or both, by turns: pair i has (i + k) % 3, the kinds moved by k). Each: top.vhd, top.ucf.
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { deviceSites } from '../../src/fpga/place.js';
import { PART } from './db.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const clkPin = opt('--clk', 'B8');
const [out] = args;
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()].sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : a.name < b.name ? -1 : 1));
const clk = pads.find(p => p.name === clkPin);
// the pairs with both pads bonded (but the clock pad's): [DIFFM, DIFFS]
const byTile = new Map();
for (const p of pads) if (p.pair) byTile.set(p.pair, [...(byTile.get(p.pair) || []), p]);
const pairs = [...byTile.values()].filter(ps => ps.length === 2 && !ps.includes(clk)).map(ps => ps.sort((a, b) => b.master - a.master));
const single = pads.filter(p => p !== clk && !pairs.flat().includes(p));
// the other ports on pads of no pair: the control inputs (input-only pads first), the outputs (up to four)
const ctl = single.filter(p => p.inputOnly).concat(single.filter(p => !p.inputOnly)).slice(0, 2);
const outs = single.filter(p => !p.inputOnly && !ctl.includes(p)).slice(0, 4);
if (ctl.length < 2 || !outs.length) throw new Error(`${PART}: too few pads outside the pairs`);
const head = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
`;
const write = (name, vhd, ucf) => {
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/${name}/top.ucf`, [...ucf.map(([n, p]) => `NET "${n}" LOC = "${p}" ;`), `NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;`].join('\n') + '\n');
};
// the second clock: bit 3 of a counter on clk, on a global buffer
const clocks = `  u_b0 : BUFG port map (I => clk, O => ck1);
  process (ck1) begin if rising_edge(ck1) then cnt <= cnt + 1; end if; end process;
  u_b1 : BUFG port map (I => cnt(3), O => ck2);`;
// a register of kind k (gen-iobreg.mjs's: clear + enable, synchronous reset + enable, synchronous set, falling edge)
// on clock c: target <= d (and te <= e)
const reg = (k, c, body, rst, set) => {
  switch (k) {
    case 0: return `  process (${c}, ctl(1)) begin if ctl(1) = '1' then ${rst} elsif rising_edge(${c}) then if ctl(0) = '1' then ${body} end if; end if; end process;`;
    case 1: return `  process (${c}) begin if rising_edge(${c}) then if ctl(1) = '1' then ${rst} elsif ctl(0) = '1' then ${body} end if; end if; end process;`;
    case 2: return `  process (${c}) begin if rising_edge(${c}) then if ctl(1) = '1' then ${set} else ${body} end if; end if; end process;`;
    default: return `  process (${c}) begin if falling_edge(${c}) then ${body} end if; end process;`;
  }
};
const init = (n, kind) => `(${Array.from({ length: n }, (_, i) => i).filter(i => kind(i) === 2).map(i => `${i} => '1'`).concat(["others => '0'"]).join(', ')})`;

// rpi0-3: input registers; d(2i) on the pair i's DIFFS (clk), d(2i + 1) on its DIFFM (ck2)
for (let k = 0; k < 4; k++) {
  const n = pairs.length * 2, kind = i => (Math.floor(i / 2) + k) % 4;
  const procs = Array.from({ length: n }, (_, i) => reg(kind(i), i % 2 ? 'ck2' : 'ck1', `r(${i}) <= d(${i});`, `r(${i}) <= '0';`, `r(${i}) <= '1';`)).join('\n');
  const groups = outs.map((_, g) => Array.from({ length: n }, (_, i) => i).filter(i => i % outs.length === g));
  const vhd = `-- rpi${k}: ${n} input registers in the IOBs of ${pairs.length} differential pairs, each pair's two on different clocks (gen-iobpair.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0);
        d : in std_logic_vector(${n - 1} downto 0); q : out std_logic_vector(${outs.length - 1} downto 0));
end top;

architecture rtl of top is
  signal ck1, ck2 : std_logic;
  signal cnt : unsigned(3 downto 0) := (others => '0');
  signal r : std_logic_vector(${n - 1} downto 0) := ${init(n, kind)};
  attribute IOB : string;
  attribute IOB of r : signal is "TRUE";
begin
${clocks}
${procs}
${groups.map((g, j) => `  q(${j}) <= ${g.map(i => `r(${i})`).join(' xor ')};`).join('\n')}
end rtl;
`;
  write(`rpi${k}`, vhd, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...pairs.flatMap(([m, s], i) => [[`d<${2 * i}>`, s.name], [`d<${2 * i + 1}>`, m.name]]),
    ...outs.map((p, i) => [`q<${i}>`, p.name])]);
}

// rpo0-3: output registers (o), output-enable registers (te) with the data straight from the fabric, or both, on
// the pairs that can drive outputs; a shift register on ck1 feeds them
const opairs = pairs.filter(ps => ps.every(p => !p.inputOnly));
for (let k = 0; k < 4; k++) {
  const n = opairs.length * 2, combo = i => (Math.floor(i / 2) + k) % 3, kind = i => (Math.floor(i / 2) + k) % 4;
  const procs = Array.from({ length: n }, (_, i) => {
    const c = combo(i), o = c !== 1, t = c !== 0;
    const body = (dv, tv) => `${o ? `o(${i}) <= ${dv}; ` : ''}${t ? `te(${i}) <= ${tv};` : ''}`.trim();
    return reg(kind(i), i % 2 ? 'ck2' : 'ck1', body(`s(${i})`, `s(${(i + 1) % n})`), body("'0'", "'0'"), body("'1'", "'1'"));
  }).join('\n');
  const vhd = `-- rpo${k}: output and output-enable registers in the IOBs of ${opairs.length} differential pairs, each pair's on different clocks (gen-iobpair.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0); q : out std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal ck1, ck2 : std_logic;
  signal cnt : unsigned(3 downto 0) := (others => '0');
  signal s : std_logic_vector(${n - 1} downto 0) := (0 => '1', others => '0');
  signal o : std_logic_vector(${n - 1} downto 0) := ${init(n, kind)};
  signal te : std_logic_vector(${n - 1} downto 0) := ${init(n, kind)};
  attribute IOB : string;
  attribute IOB of o, te : signal is "TRUE";
begin
${clocks}
  process (ck1) begin if rising_edge(ck1) then s <= s(${n - 2} downto 0) & (s(${n - 1}) xor s(${Math.floor(n / 2)})); end if; end process;
${procs}
${Array.from({ length: n }, (_, i) => {
    const c = combo(i), d = c === 1 ? `s(${(i + 2) % n})` : `o(${i})`;
    return c === 0 ? `  q(${i}) <= o(${i});` : `  q(${i}) <= ${d} when te(${i}) = '0' else 'Z';`;
  }).join('\n')}
end rtl;
`;
  write(`rpo${k}`, vhd, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...opairs.flatMap(([m, s], i) => [[`q<${2 * i}>`, s.name], [`q<${2 * i + 1}>`, m.name]])]);
}
console.log(`${pads.length} pads, ${pairs.length} pairs (${opairs.length} that can drive outputs): rpi0-3, rpo0-3`);
