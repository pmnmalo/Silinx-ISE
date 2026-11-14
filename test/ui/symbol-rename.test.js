// UI (#3829): renaming a module with a symbol of its own (<module>.sym.json, #3755). The Design pane's Rename… of reg1
// (in Portuguese, then in English) to bit_reg: its source and its symbol file renamed with it, the module's name in the
// symbol; the schematic's instance of it keeps its layout, not out of date (no dashed box, Check Schematic clean); in
// both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc } from '../../core/schdoc.js';
import { instanceParams, symbolText } from '../../core/symbol-layout.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = '1' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['d', 'ce', 'c', 'q'].map((n) => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 }));
// its symbol: the clock at the bottom, Q first on the left, spacing 30
const SYM = { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'c', side: 'S' }, { name: 'q', side: 'W' }, { name: 'd', side: 'W' }, { name: 'ce', side: 'W' }], spacing: 30, width: null, height: null, title: 'top' };
// top: an instance of reg1 placed with that symbol, alone (its pins open: the check's warnings say which)
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { module: 'reg1', generics: {}, ...instanceParams({ name: 'reg1', ports: PORTS, symbol: SYM }) } };
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires: [], ports: [], labels: [] });
}
const setLang = (page, l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);

uiTest('#3829 Rename… of a module with a symbol file: the file renamed with it, its instance keeps its layout (in Portuguese too)', E, async (page) => {
  await makeProject(env, { name: 'SymRen', top: 'top', files: { 'src/reg1.vhd': REG, 'src/reg1.sym.json': symbolText(SYM), 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('SymRen');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`).classList.contains('stale'), ED), false, 'up to date');
  // Rename… of reg1 in the Design pane, in Portuguese: the dialog's labels translated
  await setLang(page, 'pt');
  await page.treeRow('#hier', 'u1 - reg1', { right: true });
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
  await page.click('body > .menu-popup .mi', { text: 'Mudar o Nome…' });
  assert.equal(await page.waitDialog('Mudar o Nome'), 'Mudar o Nome');
  await page.eval(() => { const i = document.querySelector('.dlg-overlay input[type=text]'); i.value = 'bit_reg'; i.dispatchEvent(new Event('input')); });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay input[type=text]')][1].value), 'src/bit_reg.vhd', 'its file follows');
  await page.dialogButton('Mudar o Nome');
  await page.waitNoDialog();
  await page.waitFor(() => window.SilinxApp.S.fileTree.includes('src/bit_reg.sym.json'), [], { what: 'its symbol file renamed' });
  await setLang(page, 'en');
  await page.waitConsole(/Rename: module 'reg1' renamed to 'bit_reg' \(\d+ file\(s\) updated\); src\/reg1\.vhd → src\/bit_reg\.vhd; src\/reg1\.sym\.json → src\/bit_reg\.sym\.json\./);
  const tree = await page.eval(() => window.SilinxApp.S.fileTree.filter((f) => /sym\.json$/.test(f)));
  assert.deepEqual(tree, ['src/bit_reg.sym.json']);
  const sym = JSON.parse(await env.server.api('GET', `/api/projects/SymRen/file?path=${encodeURIComponent('src/bit_reg.sym.json')}`));
  assert.deepEqual(sym, { ...SYM, module: 'bit_reg' });
  // the schematic (reopened by the rename): its instance of bit_reg with the symbol's layout, up to date
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => window.Silinx.active?.schEditor?.getDoc().symbols[0]?.params.module === 'bit_reg' && document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'the schematic' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`).classList.contains('stale'), ED), false, 'its instance up to date');
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.ports.map((q) => `${q.name}:${q.side}`)), ['c:S', 'q:W', 'd:W', 'ce:W']);
  // Check Schematic: its open pins' warnings only, no out-of-date one
  const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
  await page.click(`${ED} .se-btn[data-act=check]`);
  await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
  await new Promise((r) => setTimeout(r, 300));
  const log = await page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
  assert.doesNotMatch(log, /out of date|ERROR/, log);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
