// Designs of several DCMs, each with its own settings, to be implemented by ISE from HDL (ise-impl.sh,
// impl-remote.sh): for settings xdl refuses in an edited design (CLKIN_DIVIDE_BY_2, #46). Every DCM
// takes CLKIN from one pad (clkPin, default B8), CLK0 through a BUFG as its feedback; its other outputs
// (CLK90, CLK2X, CLKDV, CLKFX, LOCKED, PSDONE) are sampled by flip-flops; RST, PSEN, PSINCDEC come from
// flip-flops (not in the IOBs), PSCLK is the input clock. One folder per design (top.vhd, top.ucf).
//   node gen-dcmhdl.mjs outdir spec.json
// spec.json: { name: { sites: ['DCM_X0Y1', …], dcms: [{ P: period ns, M, D: CLKFX_MULTIPLY / _DIVIDE,
//   DIV2: true, DESKEW: 'SOURCE_SYNCHRONOUS', DV: CLKDV_DIVIDE, PS: CLKOUT_PHASE_SHIFT }, …],
//   NOFX: CLKFX unused }, …], clkPin?, clkBufg?: CLKIN from a BUFG, ucf?: [more UCF lines] } }
import fs from 'node:fs';
const [out, specFile] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const [name, s] of Object.entries(spec)) {
  const n = s.dcms.length;
  const g = (k, d) => {
    const x = { P: 20, M: 2, D: 1, DIV2: false, DESKEW: 'SYSTEM_SYNCHRONOUS', DV: 2.0, PS: 'VARIABLE', ...d };
    return `    u_dcm${k} : DCM_SP
      generic map (CLKDV_DIVIDE => ${x.DV.toFixed(1)}, CLKFX_MULTIPLY => ${x.M}, CLKFX_DIVIDE => ${x.D}, CLKIN_PERIOD => ${Number(x.P).toFixed(3)},
        CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => ${x.DIV2 ? 'TRUE' : 'FALSE'}, CLKOUT_PHASE_SHIFT => "${x.PS}", PHASE_SHIFT => 0,
        DESKEW_ADJUST => "${x.DESKEW}",
        DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", DUTY_CYCLE_CORRECTION => TRUE, STARTUP_WAIT => FALSE)
      port map (CLKIN => clkin, CLKFB => clk0b(${k}), RST => c_r(0), DSSEN => '0', PSCLK => clkf, PSEN => c_r(2), PSINCDEC => c_r(3),
        CLK0 => clk0(${k}), CLK90 => c90(${k}), CLK180 => open, CLK270 => open, CLK2X => c2x(${k}), CLK2X180 => open,
        CLKDV => cdv(${k}), CLKFX => ${x.NOFX ? 'open' : `clkfx(${k})`}, CLKFX180 => open, LOCKED => locked(${k}), PSDONE => psdone(${k}), STATUS => open);
    u_b0_${k} : BUFG port map (I => clk0(${k}), O => clk0b(${k}));
    process (clk0b(${k})) begin
      if rising_edge(clk0b(${k})) then
        n(${k}) <= n(${k}) + 1;
        smp(${k}) <= (locked(${k}) & psdone(${k}) & c90(${k}) & c2x(${k}) & cdv(${k}) & ${x.NOFX ? "'0'" : `clkfx(${k})`} & "00") xor std_logic_vector(n(${k}));
      end if;
    end process;`;
  };
  const vhd = `-- ${name}: ${n} DCMs with their own settings (CLKIN_DIVIDE_BY_2, DESKEW_ADJUST, period, CLKFX)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk  : in  std_logic;
        ctl  : in  std_logic_vector(3 downto 0);
        q    : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  type cnt_t is array (0 to ${n - 1}) of unsigned(7 downto 0);
  type st_t is array (0 to ${n - 1}) of std_logic_vector(7 downto 0);
  signal n : cnt_t := (others => (others => '0'));
  signal clkin, clkf, clkp : std_logic;
  signal clk0, clk0b, clkfx, clkfxb, c90, c2x, cdv, locked, psdone : std_logic_vector(${n - 1} downto 0);
  signal smp : st_t := (others => (others => '0'));
  signal c_r : std_logic_vector(3 downto 0) := (others => '0');
  attribute IOB : string;
  attribute IOB of c_r, smp : signal is "FALSE";
begin
${s.clkBufg ? '  u_ib : IBUFG port map (I => clk, O => clkp);\n  u_bi : BUFG port map (I => clkp, O => clkin);' : '  u_ib : IBUF port map (I => clk, O => clkin);'}
  clkf <= clkin;
  process (clkf) begin if rising_edge(clkf) then c_r <= ctl; end if; end process;
${s.dcms.map((d, k) => g(k, d)).join('\n')}
  process (smp) variable v : std_logic_vector(7 downto 0); begin v := (others => '0'); for k in smp'range loop v := v xor smp(k); end loop; q <= v; end process;
end rtl;
`;
  const ucf = [`NET "clk" LOC = "${s.clkPin || 'B8'}" ;`, ...s.sites.map((site, k) => `INST "u_dcm${k}" LOC = "${site}" ;`),
    'NET "clk" CLOCK_DEDICATED_ROUTE = FALSE ;', 'NET "clkin" CLOCK_DEDICATED_ROUTE = FALSE ;', ...(s.ucf || [])].join('\n') + '\n';
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
}
console.log(Object.keys(spec).join(' '));
