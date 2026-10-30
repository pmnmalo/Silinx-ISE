// Designs of the global buffers of the left and right sides (BUFGMUX_X0Y2-9, X3Y2-9), each design a
// subset of them, to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh): which inputs of the
// side clock tiles (CLKL / CLKR) are used, in combination (#45). A BUFG's input is a bit of a counter
// (the fabric); a BUFGMUX switches between two of them, a BUFGCE stops its clock: the select / enable
// from a flip-flop (ISE's map refuses a BUFGCE on a side buffer: "Directed packing was unable to obey
// the user design constraints").
// Each buffer clocks a counter of its own; the counters' top bits are XORed to the outputs. The
// buffers of a pair (Y2 / Y3, Y4 / Y5…) share two lines: a BUFGMUX leaves its pair's other buffer free.
// (#846: BUFGMUX_1 too, on any buffer, the top and bottom ones included: its DISABLE_ATTR HIGH.)
//   node gen-sidebufg.mjs outdir spec.json
// spec.json: { name: { bufs: [{ site: 'BUFGMUX_X0Y4', kind: 'BUFG' | 'BUFGMUX' | 'BUFGMUX_1' | 'BUFGCE' }, …],
//   clkPin?: 'B8', ucf?: [more UCF lines] } }; random: node gen-sidebufg.mjs outdir --random N seed [prefix]
//   (N designs, each side buffer used with probability 1/2, a BUFGMUX in about one pair of four)
import fs from 'node:fs';

const [out, specArg, ...rest] = process.argv.slice(2);
const SITES = [0, 3].flatMap(x => [2, 3, 4, 5, 6, 7, 8, 9].map(y => `BUFGMUX_X${x}Y${y}`));
let spec;
if (specArg === '--random') {
  const [n, seed0, prefix = 'r'] = rest;
  let seed = +seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  spec = {};
  for (let i = 0; i < +n; i++) {
    const bufs = [];
    for (let p = 0; p < SITES.length; p += 2) {
      if (rnd() < 0.25) { bufs.push({ site: SITES[p + (rnd() < 0.5 ? 0 : 1)], kind: 'BUFGMUX' }); continue; }
      for (const s of [SITES[p], SITES[p + 1]]) if (rnd() < 0.5) bufs.push({ site: s, kind: 'BUFG' });
    }
    if (!bufs.length) bufs.push({ site: SITES[Math.floor(rnd() * SITES.length)], kind: 'BUFG' });
    spec[`${prefix}${String(i).padStart(2, '0')}`] = { bufs };
  }
} else spec = JSON.parse(fs.readFileSync(specArg, 'utf8'));

for (const [name, s] of Object.entries(spec)) {
  const n = s.bufs.length;
  const sels = b => /^BUFGMUX/.test(b.kind) || b.kind === 'BUFGCE';
  const nmux = s.bufs.filter(sels).length;
  const sel = k => `sel(${s.bufs.slice(0, k).filter(sels).length})`;
  const body = s.bufs.map((b, k) => (/^BUFGMUX/.test(b.kind)
    ? `  u_b${k} : ${b.kind} port map (I0 => div(${k}), I1 => div(${k + 1}), S => ${sel(k)}, O => gclk(${k}));`
    : b.kind === 'BUFGCE' ? `  u_b${k} : BUFGCE port map (I => div(${k}), CE => ${sel(k)}, O => gclk(${k}));`
    : `  u_b${k} : BUFG port map (I => div(${k}), O => gclk(${k}));`)
    + `\n  process (gclk(${k})) begin if rising_edge(gclk(${k})) then n(${k}) <= n(${k}) + 1; end if; end process;`).join('\n');
  const vhd = `-- ${name}: ${n} global buffers of the sides (${s.bufs.map(b => `${b.site} ${b.kind}`).join(', ')})
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        ctl : in  std_logic;
        q   : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  type cnt_t is array (0 to ${n - 1}) of unsigned(3 downto 0);
  signal div : unsigned(${n} downto 0) := (others => '0');
  signal gclk : std_logic_vector(${n - 1} downto 0);
  signal n : cnt_t := (others => (others => '0'));
  signal sel : std_logic_vector(${Math.max(nmux, 1) - 1} downto 0) := (others => '0');
  signal clkb : std_logic;
  attribute IOB : string;
  attribute IOB of sel : signal is "FALSE";
begin
  u_main : BUFG port map (I => clk, O => clkb);
  process (clkb) begin if rising_edge(clkb) then div <= div + 1; sel <= sel(sel'high - 1 downto 0) & ctl; end if; end process;
${body}
  process (n) variable v : std_logic_vector(3 downto 0); begin
    v := (others => '0');
    for k in n'range loop v := v xor std_logic_vector(n(k)); end loop;
    q <= v;
  end process;
end rtl;
`.replace('sel <= sel(sel\'high - 1 downto 0) & ctl;', nmux > 1 ? 'sel <= sel(sel\'high - 1 downto 0) & ctl;' : 'sel(0) <= ctl;');
  const ucf = [`NET "clk" LOC = "${s.clkPin || 'B8'}" ;`, ...s.bufs.map((b, k) => `INST "u_b${k}" LOC = "${b.site}" ;`), ...(s.ucf || [])].join('\n') + '\n';
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
}
console.log(Object.keys(spec).join(' '));
