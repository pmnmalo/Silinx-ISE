// Designs with the I/O registers of every bonded pad used, to be implemented by ISE from HDL
// (ise-impl.sh, impl-remote.sh: ISE's map places them in the IOBs): the settings of the IOB
// flip-flops and DDR registers per pad (#44; gen-iobrand.mjs variants, ana-iobreg.mjs).
//   PART=xc3s500efg320-4 node gen-iobreg.mjs outdir [--clk B8]
// Writes outdir/ri (every pad an input register but the clock, two control inputs and eight outputs;
// the registers' kinds cycle through the pads: clear + enable, synchronous reset + enable, synchronous
// set with initial value 1, falling edge), outdir/ro, ro2, ro3 (every pad that can drive an output
// register, one in three with a registered output enable too, a different third in each), outdir/rd,
// rd2 (IDDR2 on the inputs and ODDR2 on the outputs, alternately, the other way round in rd2), outdir/rt
// (every pad that can drive one a tristate output, its enable from the fabric: #96) and outdir/rb (every
// pad a direct input). Each: top.vhd, top.ucf (the pins of the pads).
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { deviceSites } from '../../core/fpga/place.js';
import { PART } from './db.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const clkPin = opt('--clk', 'B8');
// --rot k (1-3): only rik / rok, the registers' kinds moved by k pads (every kind on every pad)
const rot = +opt('--rot', '0');
// --te k (0-3): only rtek: every pad that can drive one an output register and a registered output enable, the
// registers' kinds moved by k pads (#96: ro / rok have the enable on a third of the pads, so each pad sees it with
// two kinds at most)
const te = opt('--te', null);
const kr = te !== null ? +te : rot;
// --outs-last: only rio (with --rot k: riok) and rbo, ri and rb with their eight outputs on the last pads that can drive one instead of the first (#96: ri
// and rik never have an input register on those eight, so their plain input register was not measured)
const outsLast = args.includes('--outs-last');
if (outsLast) args.splice(args.indexOf('--outs-last'), 1);
// --bufg SITE: only rd and rd2, their clock buffer on that BUFGMUX (the clock pad reaching it through general
// routing), so that the I/O tiles' clock pins are clocked from its global line (#671: lines 0-7, each buffer
// of the top and bottom drives one)
const bufg = opt('--bufg', null);
const [out] = args;
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()].sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : a.name < b.name ? -1 : 1));
const rest = pads.filter(p => p.name !== clkPin);
const io = rest.filter(p => !p.inputOnly);
const head = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
`;
const write = (name, vhd, ucf, extra = []) => {
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/${name}/top.ucf`, [...ucf.map(([n, p]) => `NET "${n}" LOC = "${p}" ;`), ...extra].join('\n') + '\n');
};
// an XOR tree of a vector into one bit (the registers' loads)
const xorOf = (v, n) => Array.from({ length: n }, (_, i) => `${v}(${i})`).join(' xor ') || "'0'";

// ri: input registers; ctl(0) enable, ctl(1) reset; q: eight outputs (input-only pads cannot drive them)
for (const name of bufg ? [] : outsLast ? [rot ? `rio${rot}` : 'rio'] : te !== null ? [] : rot ? [`rik${rot}`] : ['ri']) {
  const outs = outsLast ? io.slice(-8) : io.slice(0, 8), ctl = rest.filter(p => !outs.includes(p)).slice(0, 2);
  const ins = rest.filter(p => !outs.includes(p) && !ctl.includes(p));
  const n = ins.length;
  const kinds = ins.map((_, i) => (i + rot) % 4);
  const procs = ins.map((_, i) => {
    switch (kinds[i]) {
      case 0: return `  process (clk, ctl(1)) begin if ctl(1) = '1' then r(${i}) <= '0'; elsif rising_edge(clk) then if ctl(0) = '1' then r(${i}) <= d(${i}); end if; end if; end process;`;
      case 1: return `  process (clk) begin if rising_edge(clk) then if ctl(1) = '1' then r(${i}) <= '0'; elsif ctl(0) = '1' then r(${i}) <= d(${i}); end if; end if; end process;`;
      case 2: return `  process (clk) begin if rising_edge(clk) then if ctl(1) = '1' then r(${i}) <= '1'; else r(${i}) <= d(${i}); end if; end if; end process;`;
      default: return `  process (clk) begin if falling_edge(clk) then r(${i}) <= d(${i}); end if; end process;`;
    }
  }).join('\n');
  const groups = Array.from({ length: 8 }, (_, g) => ins.map((_, i) => i).filter(i => i % 8 === g));
  const vhd = `-- ri: ${n} input registers in the IOBs (gen-iobreg.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0);
        d : in std_logic_vector(${n - 1} downto 0); q : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal r : std_logic_vector(${n - 1} downto 0) := (${ins.map((_, i) => (kinds[i] === 2 ? `${i} => '1'` : null)).filter(Boolean).concat(['others => \'0\'']).join(', ')});
  attribute IOB : string;
  attribute IOB of r : signal is "TRUE";
begin
${procs}
${groups.map((g, k) => `  q(${k}) <= ${g.map(i => `r(${i})`).join(' xor ') || "'0'"};`).join('\n')}
end rtl;
`;
  write(name, vhd, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...ins.map((p, i) => [`d<${i}>`, p.name]), ...outs.map((p, i) => [`q<${i}>`, p.name])]);
}

// ro, ro2, ro3: output registers (and one in three with a registered output enable: the pads i % 3 ==
// 0, 1, 2); a shift register feeds them
for (const [name, ph] of outsLast || bufg ? [] : te !== null ? [[`rtek${te}`, -1]] : rot ? [[`rok${rot}`, rot % 3]] : [['ro', 0], ['ro2', 1], ['ro3', 2]]) {
  const ctl = rest.filter(p => p.inputOnly).slice(0, 2).concat(rest.filter(p => !p.inputOnly)).slice(0, 2);
  const outs = io.filter(p => !ctl.includes(p));
  const n = outs.length;
  const procs = outs.map((_, i) => {
    const t = ph < 0 || i % 3 === ph;
    const body = (dv, tv) => `o(${i}) <= ${dv};${t ? ` te(${i}) <= ${tv};` : ''}`;
    switch ((i + kr) % 4) {
      case 0: return `  process (clk, ctl(1)) begin if ctl(1) = '1' then ${body("'0'", "'0'")} elsif rising_edge(clk) then if ctl(0) = '1' then ${body(`s(${i})`, `s(${(i + 1) % n})`)} end if; end if; end process;`;
      case 1: return `  process (clk) begin if rising_edge(clk) then if ctl(1) = '1' then ${body("'0'", "'0'")} elsif ctl(0) = '1' then ${body(`s(${i})`, `s(${(i + 1) % n})`)} end if; end if; end process;`;
      case 2: return `  process (clk) begin if rising_edge(clk) then if ctl(1) = '1' then ${body("'1'", "'1'")} else ${body(`s(${i})`, `s(${(i + 1) % n})`)} end if; end if; end process;`;
      default: return `  process (clk) begin if falling_edge(clk) then ${body(`s(${i})`, `s(${(i + 1) % n})`)} end if; end process;`;
    }
  }).join('\n');
  const vhd = `-- ro: ${n} output registers in the IOBs, one in three with a registered output enable (gen-iobreg.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0); q : out std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal s : std_logic_vector(${n - 1} downto 0) := (0 => '1', others => '0');
  signal o : std_logic_vector(${n - 1} downto 0) := (${outs.map((_, i) => ((i + kr) % 4 === 2 ? `${i} => '1'` : null)).filter(Boolean).concat(['others => \'0\'']).join(', ')});
  signal te : std_logic_vector(${n - 1} downto 0) := (${outs.map((_, i) => ((i + kr) % 4 === 2 ? `${i} => '1'` : null)).filter(Boolean).concat(['others => \'0\'']).join(', ')});
  attribute IOB : string;
  attribute IOB of o, te : signal is "TRUE";
begin
  process (clk) begin if rising_edge(clk) then s <= s(${n - 2} downto 0) & (s(${n - 1}) xor s(${Math.floor(n / 2)})); end if; end process;
${procs}
${outs.map((_, i) => (ph < 0 || i % 3 === ph ? `  q(${i}) <= o(${i}) when te(${i}) = '0' else 'Z';` : `  q(${i}) <= o(${i});`)).join('\n')}
end rtl;
`;
  write(name, vhd, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...outs.map((p, i) => [`q<${i}>`, p.name])]);
}

// rd, rd2: IDDR2 on inputs, ODDR2 on outputs (alternately: the outputs on the odd, the even pads),
// their registers' kinds varied
for (const [name, par] of rot || te !== null || outsLast ? [] : [['rd', 1], ['rd2', 0]]) {
  const ctl = rest.filter(p => p.inputOnly).slice(0, 2);
  const others = rest.filter(p => !ctl.includes(p));
  const outs = others.filter((p, i) => !p.inputOnly && i % 2 === par);
  const ins = others.filter(p => !outs.includes(p));
  const ni = ins.length, no = outs.length;
  const srt = k => ['"SYNC"', '"ASYNC"'][k % 2];
  const vhd = `-- rd: ${ni} IDDR2 and ${no} ODDR2 (gen-iobreg.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic_vector(1 downto 0);
        d : in std_logic_vector(${ni - 1} downto 0); q : out std_logic_vector(${no - 1} downto 0));
end top;

architecture rtl of top is
  signal clkb, clkn : std_logic;
  signal r0, r1 : std_logic_vector(${ni - 1} downto 0);
  signal x : std_logic_vector(${Math.max(ni, no) - 1} downto 0);
begin
  u_b : BUFG port map (I => clk, O => clkb);
  clkn <= not clkb;
${ins.map((_, i) => `  u_i${i} : IDDR2 generic map (DDR_ALIGNMENT => "NONE", INIT_Q0 => '${i % 3 === 1 ? 1 : 0}', INIT_Q1 => '0', SRTYPE => ${srt(i)})
    port map (D => d(${i}), C0 => clkb, C1 => clkn, CE => ${i % 2 ? "'1'" : 'ctl(0)'}, R => ${i % 3 === 1 ? "'0'" : 'ctl(1)'}, S => ${i % 3 === 1 ? 'ctl(1)' : "'0'"}, Q0 => r0(${i}), Q1 => r1(${i}));`).join('\n')}
${Array.from({ length: Math.max(ni, no) }, (_, i) => `  x(${i}) <= r0(${i % ni}) xor r1(${(i + 1) % ni});`).join('\n')}
${outs.map((_, i) => `  u_o${i} : ODDR2 generic map (DDR_ALIGNMENT => "NONE", INIT => '${i % 3 === 1 ? 1 : 0}', SRTYPE => ${srt(i + 1)})
    port map (D0 => x(${i}), D1 => x(${(i + 1) % Math.max(ni, no)}), C0 => clkb, C1 => clkn, CE => ${i % 2 ? "'1'" : 'ctl(0)'}, R => ${i % 3 === 1 ? "'0'" : 'ctl(1)'}, S => ${i % 3 === 1 ? 'ctl(1)' : "'0'"}, Q => q(${i}));`).join('\n')}
end rtl;
`;
  write(name, vhd, [['clk', clkPin], ...ctl.map((p, i) => [`ctl<${i}>`, p.name]), ...ins.map((p, i) => [`d<${i}>`, p.name]), ...outs.map((p, i) => [`q<${i}>`, p.name])],
    bufg ? [`INST "u_b" LOC = "${bufg}" ;`, 'NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;'] : []);
}
// rt (#96): every pad that can drive an output a tristate output, its enable from the fabric (TMUX T1: a
// flip-flop kept out of the IOB, one in two through an inverter), its data from a shift register
if (!rot && te === null && !outsLast && !bufg) {
  const ctl = rest.filter(p => p.inputOnly).slice(0, 1).concat(rest.filter(p => !p.inputOnly)).slice(0, 1);
  const outs = io.filter(p => !ctl.includes(p));
  const n = outs.length;
  const vhd = `-- rt: ${n} tristate outputs, their enables from the fabric (gen-iobreg.mjs)
${head}
entity top is
  port (clk : in std_logic; ctl : in std_logic; q : out std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal s, te : std_logic_vector(${n - 1} downto 0) := (0 => '1', others => '0');
  attribute IOB : string;
  attribute IOB of s, te : signal is "FALSE";
begin
  process (clk) begin if rising_edge(clk) then s <= s(${n - 2} downto 0) & (s(${n - 1}) xor s(${Math.floor(n / 2)}) xor ctl); te <= s(0) & te(${n - 1} downto 1); end if; end process;
${outs.map((_, i) => `  q(${i}) <= s(${(i + 1) % n}) when te(${i}) = '${i % 2}' else 'Z';`).join('\n')}
end rtl;
`;
  write('rt', vhd, [['clk', clkPin], ['ctl', ctl[0].name], ...outs.map((p, i) => [`q<${i}>`, p.name])]);
}
// rb: every pad a direct input (no register; their input delays: gen-iobrand.mjs --delays), eight
// outputs (XORs of the inputs)
for (const name of bufg ? [] : outsLast ? (rot ? [] : ['rbo']) : rot || te !== null ? [] : ['rb']) {
  const outs = outsLast ? io.slice(-8) : io.slice(0, 8);
  const ins = rest.filter(p => !outs.includes(p));
  const n = ins.length;
  const vhd = `-- rb: ${n} direct inputs (gen-iobreg.mjs)
${head}
entity top is
  port (clk : in std_logic; d : in std_logic_vector(${n - 1} downto 0); q : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
begin
${Array.from({ length: 8 }, (_, k) => `  q(${k}) <= ${ins.map((_, i) => i).filter(i => i % 8 === k).map(i => `d(${i})`).join(' xor ') || "'0'"};`).join('\n')}
end rtl;
`;
  write(name, vhd, [...ins.map((p, i) => [`d<${i}>`, p.name]), ...outs.map((p, i) => [`q<${i}>`, p.name])]);
}
console.log(`${pads.length} pads (${io.length + 1} that can drive an output): ${bufg ? `rd, rd2 (clock buffer ${bufg})` : outsLast ? (rot ? `rio${rot}` : 'rio, rbo') : te !== null ? `rtek${te}` : rot ? `rik${rot}, rok${rot}` : 'ri, ro, ro2, ro3, rd, rd2, rt, rb'}`);
