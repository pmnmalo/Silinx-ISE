// UI (#3828): a schematic with an arrayed instance (reg(3:0) of a 1-bit register) drawn with its module's symbol of its
// own (Q on the left, D on the top, the clock at the bottom) exported by File ▸ Export Project (.zip)… to Xilinx ISE
// (its .sch, the module's .sym with the pins on their sides; no .sym.json) and imported back by Import Project (.zip)…:
// the instance arrayed, drawn with the symbol, not out of date, the module's .sym.json made; Check Schematic clean; in
// both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { setupUi, uiTest, makeProject, readWs, waitDownload } from './harness.js';
import { FILE, exportZip, openImport } from './zip-helpers.js';
import { readZip } from '../../core/zip.js';
import { normalizeDoc, symbolPins } from '../../core/schdoc.js';
import { instanceParams, symbolText } from '../../core/symbol-layout.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d) => zlib.inflateRawSync(d) };

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = '1' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['d', 'ce', 'c', 'q'].map((n) => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 }));
const SYM = { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }], spacing: 20, width: null, height: null, title: 'top' };
const MODS = { reg1: { name: 'reg1', lang: 'vhdl', ports: PORTS, symbol: SYM } };
const OUT = { W: [-60, 0], E: [60, 0], N: [0, -60], S: [0, 60] };
// top: reg(3:0) drawn with SYM, each pin wired to a marker (d and q 4 bits wide)
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'reg(3:0)', params: { module: 'reg1', generics: {}, ...instanceParams(MODS.reg1) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    const b = { x: p.x + OUT[p.side][0], y: p.y + OUT[p.side][1] };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name === 'c' ? 'clk' : p.name, dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'd' || p.name === 'q' ? 4 : 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [s], wires, ports, labels: [] }, { modules: MODS });
}
const check = async (page) => {
  const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
  await page.click(`${ED} .se-btn[data-act=check]`);
  await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
  await new Promise((r) => setTimeout(r, 300));
  return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
};

uiTest('#3828 Export Project to Xilinx ISE and Import Project back: reg(3:0) arrayed, drawn with its module\'s symbol, up to date', E, async (page) => {
  await makeProject(env, { name: 'ArrIse', top: 'top', board: 'basys2', files: { 'src/reg1.vhd': REG, 'src/reg1.sym.json': symbolText(SYM), 'src/top.vhd': 'entity top is end top;\narchitecture a of top is begin end a;\n', 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('ArrIse');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  assert.doesNotMatch(await check(page), /ERROR|WARNING/);
  // to ISE: the .sch with the block reg(3:0), the module's .sym with D on the top; no .sym.json
  await exportZip(page, 'xilinx');
  const zip = await waitDownload(page, 'ArrIse.zip');
  const entries = await readZip(new Uint8Array(await fs.readFile(zip)), codec);
  const text = (p) => Buffer.from(entries.find((e) => e.path === p).data).toString('utf8');
  assert.deepEqual(entries.map((e) => e.path).filter((p) => /^src\//.test(p)).sort(), ['src/reg1.sym', 'src/reg1.vhd', 'src/top.sch', 'src/top.vhd']);
  assert.match(text('src/top.sch'), /<block symbolname="reg1" name="reg\(3:0\)">\n {12}<blockpin signalname="q\(3:0\)" name="q" \/>/);
  assert.match(text('src/reg1.sym'), /<pin polarity="Input" x="192" y="-320" name="d" \/>/);

  // and back, as a new project
  await openImport(page, 'xilinx');
  await page.setFiles(FILE, [zip]);
  await page.fill('.dlg-overlay input[type=text]', 'ArrBack');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'ArrBack');
  await page.waitConsole(/Imported Xilinx ISE project 'ArrBack'/);
  assert.deepEqual(JSON.parse(await readWs(env, 'ArrBack', 'src/reg1.sym.json')).pins, SYM.pins);
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => window.Silinx.active?.path === 'src/top.sch.json' && document.querySelector(`${ed} svg .sym`), [ED], { what: 'the imported schematic' });
  const s = await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.find((x) => x.type === 'module'));
  assert.deepEqual([s.name, s.params.ports.map((q) => `${q.name}:${q.side}`)], ['reg(3:0)', ['q:W', 'ce:W', 'd:N', 'c:S']]);
  assert.equal(await page.eval((ed, id) => document.querySelector(`${ed} svg .sym[data-id="${id}"]`).classList.contains('stale'), ED, s.id), false, 'up to date');
  assert.doesNotMatch(await check(page), /ERROR|WARNING|out of date/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });
