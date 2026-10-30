// trce's Component Switching Limit checks on a DCM (#661): DCM_SP variants (its settings, the outputs used, the pad's
// PERIOD) built by ISE's own flow on the ISE host (the user's ISE settings in SSH mode, ~/.silinx/config.json, or
// SILINX_ISE_HOST; its host never written in a file), trce -v; back here only trce's reports and logs, in
// <out folder>/res/<variant> (outside the repository: ISE's outputs are never committed). One ISE job at a time: it
// waits until no ISE container runs.
//   node research/s3e-route/switching-limits.mjs <out folder> [variants.json]   (default: switching-limits.json here)
// A variant: { name, dev: 'basys2' | 'nexys2', period (ns, default 20), outs: ['CLK0', 'CLKFX', ...], g: { generic: VHDL value } }.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateBuild } from '../../../../server/ise.js';
const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '../../../..');
const [outDir, vfile = path.join(HERE, 'switching-limits.json')] = process.argv.slice(2);
if (!outDir) { console.error('usage: switching-limits.mjs <out folder> [variants.json]'); process.exit(2); }
const variants = JSON.parse(fs.readFileSync(vfile, 'utf8'));
// a board's pins (the ones the design has) and the PERIOD on clk (its TNM_NET: without it the TIMESPEC is dropped)
const pick = f => `${fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').filter(l => /^NET "(clk|sw<[0-3]>|led<[0-7]>)"/.test(l) && !/TNM_NET/.test(l)).join('\n')}
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
`;
const DEV = { basys2: { part: 'xc3s250e', package: 'cp132', ucf: pick('test/fixtures/open-flow/basys2.ucf') },
  nexys2: { part: 'xc3s500e', package: 'fg320', ucf: pick('test/fixtures/open-flow/feat_dcm_fx/top.ucf') } };
function vhdl(v) {
  const g = { CLKDV_DIVIDE: '2.0', CLKFX_MULTIPLY: 2, CLKFX_DIVIDE: 1, CLKIN_PERIOD: '20.0', CLK_FEEDBACK: '"1X"', CLKIN_DIVIDE_BY_2: 'FALSE',
    CLKOUT_PHASE_SHIFT: '"NONE"', DESKEW_ADJUST: '"SYSTEM_SYNCHRONOUS"', DFS_FREQUENCY_MODE: '"LOW"', DLL_FREQUENCY_MODE: '"LOW"', STARTUP_WAIT: 'FALSE', ...v.g };
  const outs = v.outs;  // e.g. ['CLK0','CLKFX']
  const all = ['CLK0','CLK90','CLK180','CLK270','CLK2X','CLK2X180','CLKDV','CLKFX','CLKFX180'];
  const fb = g.CLK_FEEDBACK === '"NONE"' ? "'0'" : (g.CLK_FEEDBACK === '"2X"' ? 'b_CLK2X' : 'b_CLK0');
  return `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL; library UNISIM; use UNISIM.VCOMPONENTS.ALL;
entity top is port (clk : in std_logic; sw : in std_logic_vector(3 downto 0); led : out std_logic_vector(7 downto 0)); end top;
architecture rtl of top is
  signal clkin_b, locked : std_logic;
${outs.map(o => `  signal u_${o}, b_${o} : std_logic; signal n_${o} : unsigned(26 downto 0) := (others => '0');`).join('\n')}
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);
  u_dcm : DCM_SP generic map (${Object.entries(g).map(([k, x]) => `${k} => ${x}`).join(', ')})
    port map (CLKIN => clkin_b, CLKFB => ${fb}, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      ${all.map(o => `${o} => ${outs.includes(o) ? `u_${o}` : 'open'}`).join(', ')}, LOCKED => locked, PSDONE => open, STATUS => open);
${outs.map(o => `  bb_${o} : BUFG port map (I => u_${o}, O => b_${o});
  process (b_${o}) begin if rising_edge(b_${o}) then if sw(0) = '0' then n_${o} <= n_${o} + 1; end if; end if; end process;`).join('\n')}
  led <= locked & "0000000" when sw(1) = '1' else (${outs.map((o, i) => `${i} => n_${o}(25)`).join(', ')}, others => '0');
end rtl;
`;
}
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.silinx', 'config.json'), 'utf8')).ssh || {};
if (!process.env.SILINX_ISE_HOST && !cfg.host) throw new Error('~/.silinx/config.json: no ssh host (the ISE machine)');
const host = process.env.SILINX_ISE_HOST || `${cfg.user ? `${cfg.user}@` : ''}${cfg.host}`;
const ssh = cmd => execFileSync('ssh', ['-o', 'BatchMode=yes', '--', host, `export PATH="$PATH:/usr/local/bin"; ${cmd}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
const send = path.join(outDir, 'send'); fs.rmSync(send, { recursive: true, force: true }); fs.mkdirSync(send, { recursive: true });
for (const v of variants) {
  const d = DEV[v.dev || 'basys2'];
  const p = path.join(outDir, 'proj', v.name); fs.rmSync(p, { recursive: true, force: true }); fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'top.vhd'), vhdl(v));
  let ucf = d.ucf; if (v.period) ucf = ucf.replace(/PERIOD "clk" [\d.]+ ns/, `PERIOD "clk" ${v.period} ns`);
  fs.writeFileSync(path.join(p, 'top.ucf'), ucf);
  const proj = { name: v.name, top: 'top', device: { family: 'spartan3e', part: d.part, package: d.package, speed: '-4' }, files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: 'top.ucf' };
  fs.writeFileSync(path.join(p, 'silinx.json'), JSON.stringify(proj));
  const { buildDir } = await generateBuild(proj, p);
  fs.cpSync(buildDir, path.join(send, v.name), { recursive: true });
}
fs.writeFileSync(path.join(send, 'go.sh'), `source /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1
cd /w; for b in "$@"; do ( cd $b; bash run.sh synth translate map par > flow.log 2>&1; [ -s top.ncd ] && trce -v 30 -u 10 top.ncd top.pcf -o ise.twr > trce.log 2>&1; echo "$b: $(grep -h 'Timing errors' ise.twr 2>/dev/null|head -1) $(grep -hE '^ERROR' flow.log | head -2)" ); done
`);
const remote = `silinx-csl/${path.basename(outDir)}`;
ssh(`while docker ps --format '{{.Image}}' | grep -q xilinx/ise; do sleep 20; done; rm -rf ${remote} && mkdir -p ${remote}`);
execFileSync('rsync', ['-a', `${send}/`, `${host}:${remote}/`]);
console.log(ssh(`docker run --rm --platform linux/amd64 -v "$HOME/${remote}":/w ${cfg.image || 'xilinx/ise:14.7'} bash /w/go.sh ${variants.map(v => v.name).join(' ')}`));
for (const v of variants) execFileSync('rsync', ['-a', '--include=*.twr', '--include=*.log', '--include=*.pcf', '--include=*.mrp', '--include=*.par', '--exclude=*', `${host}:${remote}/${v.name}/`, path.join(outDir, 'res', v.name) + '/']);
ssh(`rm -rf ${remote}`);
