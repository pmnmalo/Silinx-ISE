// UI (#3755): an arrayed instance in the schematic editor, as ISE's: a 1-bit register's instance on 4-bit buses (its D
// and Q, a width mismatch while it is one instance) renamed reg(3:0) in its Properties: 4 copies, Check Schematic clean,
// its HDL the copies reg_3 … reg_0; renamed reg again, the width mismatch back; in both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then q <= d; end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['d', 'c', 'q'].map((n) => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 }));
const MODS = { reg1: { name: 'reg1', lang: 'vhdl', ports: PORTS } };
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'r', params: { module: 'reg1', generics: {}, ports: PORTS } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name === 'c' ? 'clk' : p.name, dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'c' ? 1 : 4, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [s], wires, ports, labels: [] });
}

uiTest('#3755 an instance renamed reg(3:0): 4 copies on its buses, the check clean, its HDL the copies', E, async (page) => {
  await makeProject(env, { name: 'SchArr', top: 'top', files: { 'src/reg1.vhd': REG, 'src/top.vhd': 'entity top is end top;\narchitecture a of top is begin end a;\n', 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('SchArr');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  // Check Schematic: what it adds to the console
  const check = async () => {
    const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
    await page.click(`${ED} .se-btn[data-act=check]`);
    await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
    await new Promise((r) => setTimeout(r, 300));
    return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
  };
  assert.match(await check(), /width mismatch on net 'd': 4 vs 1 bits/);
  // its name in its Properties: reg(3:0)
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  const rename = (v) => page.eval((ed, x) => {
    const i = [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label').textContent === 'Instance name').querySelector('input');
    i.focus(); i.value = x; i.dispatchEvent(new Event('change'));
  }, ED, v);
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-props .se-field label`)].some((l) => l.textContent === 'Instance name'), [ED], { what: 'its properties' });
  await rename('reg(3:0)');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].name === 'reg(3:0)', [], { what: 'renamed' });
  const log = await check();
  assert.doesNotMatch(log, /width mismatch|ERROR|WARNING/, log);
  // saved: its HDL the 4 copies
  await page.key('s', { modifiers: 2 });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  await page.waitFor(async () => /reg_0 : entity work\.reg1/.test(await (await fetch(`/api/projects/SchArr/file?path=${encodeURIComponent('src/top.vhd')}`)).text()), [], { what: 'its HDL made' });
  const hdl = await env.server.api('GET', `/api/projects/SchArr/file?path=${encodeURIComponent('src/top.vhd')}`);
  assert.deepEqual(hdl.match(/reg_\d : entity work\.reg1/g), ['reg_3 : entity work.reg1', 'reg_2 : entity work.reg1', 'reg_1 : entity work.reg1', 'reg_0 : entity work.reg1']);
  assert.match(hdl, /d => d\(1\),\n {6}c => clk,\n {6}q => q\(1\)/);
  // one instance again: the mismatch back
  await rename('reg1x');
  assert.match(await check(), /width mismatch on net 'd': 4 vs 1 bits/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
