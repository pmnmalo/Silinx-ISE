// UI: bidirectional (inout, tri-state) ports in the beginner wizards. Module (Wizard): a module with
// inout ports (quick-add and a typed row), tri-state template written and compiling; Schematic
// (Wizard): inout markers on the right edge, then the live simulation drives / releases them; Test
// Bench Wizard: a bidirectional register tested exhaustively (expected values from the design) and
// with typed drive / release rows, TEST PASSED in ISim.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Source ▸ <type>: the file name, Finish on page 1 opens the wizard `title`
async function openWizard(page, type, name, title) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === t); r.scrollIntoView(); r.click(); }, type);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Finish');
  await page.waitDialog(title);
}
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
const quick = (page, port) => page.click(`.dlg-overlay .mw-qa[data-port=${port}]`);
const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
const noErrors = (text, lang, top) => {
  const lib = compile([{ path: `src/${top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text }]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  return d;
};

uiTest('Module (Wizard): bidirectional ports (quick-add data[7:0], a typed inout row), tri-state template, opened and compiling', E, async (page) => {
  await makeProject(env, { name: 'IoMw' });
  await page.openProject('IoMw');
  for (const lang of ['vhdl', 'verilog']) {
    const name = `busctl_${lang}`;
    await openWizard(page, 'Module (Wizard)', name, 'Module Wizard');
    await page.fill('.dlg-overlay .wiz-main select', lang);
    await next(page, 'Inputs and Outputs');
    for (const p of ['a', 'data', 'y']) await quick(page, p);
    await page.click('.dlg-overlay .mw-add');
    await page.fill('.dlg-overlay .mw-pname', 'ack', { index: 3 });
    // the direction list offers 'bidirectional' (inout), translated in Portuguese
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pdir')[3].options].map((o) => `${o.value}:${o.textContent}`)), ['in:input', 'out:output', 'inout:bidirectional']);
    if (lang === 'vhdl') {
      await setLang(page, 'pt');
      await page.waitFor(() => document.querySelectorAll('.dlg-overlay .mw-pdir')[3].options[2].textContent === 'bidirecional', [], { what: 'Portuguese direction' });
      assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-quick').textContent), /Adicionar \(bidirecionais\):/);
      await setLang(page, 'en');
    }
    await page.fill('.dlg-overlay .mw-pdir', 'inout', { index: 3 });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pdir')].map((e) => e.value)), ['in', 'inout', 'out', 'inout']);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pwidth')].map((e) => e.value)), ['8', '8', '1', '1']);
    await next(page, 'Kind of Logic');
    assert.ok(await page.eval(() => document.querySelector('.dlg-overlay input[name=mw-kind][value=comb]').checked));
    await next(page, 'Summary');
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /Bidirectional \(inout, tri-state\): data \[7:0\], ack; each one gets an output enable data_oe, ack_oe/);
    const preview = await page.eval(() => document.querySelector('.dlg-overlay .mw-preview').textContent);
    assert.match(preview, lang === 'vhdl' ? /data <= data_out when data_oe = '1' else \(others => 'Z'\);/ : /assign data = data_oe \? data_out : 8'bz;/);
    await next(page, null);
    await page.waitNoDialog();
    const path = `src/${name}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    await page.waitFor((p) => window.Silinx.project.files.some((f) => f.path === p && f.role === 'design'), [path], { what: `${path} registered` });
    const text = await readWs(env, 'IoMw', path);
    assert.match(text, lang === 'vhdl' ? /data : inout std_logic_vector\(7 downto 0\)/ : /inout\s+wire \[7:0\] data/);
    assert.match(text, lang === 'vhdl' ? /ack <= ack_out when ack_oe = '1' else 'Z';/ : /assign ack = ack_oe \? ack_out : 1'bz;/);
    const d = noErrors(text, lang, name);
    assert.deepEqual(d.top.ports.map((p) => `${p.name}:${p.dir}`), ['a:in', 'data:inout', 'y:out', 'ack:inout']);
  }
});

uiTest('Schematic (Wizard): bidirectional markers on the right edge; live simulation drives and releases them', E, async (page) => {
  await makeProject(env, { name: 'IoSw' });
  await page.openProject('IoSw');
  await openWizard(page, 'Schematic (Wizard)', 'bus_io', 'Schematic Wizard');
  await next(page, 'Inputs and Outputs');
  for (const p of ['sw', 'led', 'data', 'sda']) await quick(page, p);
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /Bidirectional markers \(right edge, below the outputs\): data \[7:0\], sda/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/bus_io.sch.json' && window.Silinx.active.schEditor, [], { what: 'schematic editor' });
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['sw:in:4', 'led:out:8', 'data:inout:8', 'sda:inout:1']);
  const [led, data, sda] = ['led', 'data', 'sda'].map((n) => doc.ports.find((p) => p.name === n));
  assert.ok(data.x === led.x && sda.x === led.x && data.y > led.y + 60 && sda.y > data.y, 'right column, below the outputs');
  // live simulation: the bidirectional markers are released (Z) until clicked
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-bidir`), [ED], { what: 'simulation mode' });
  const ctl = (id) => `${ED} .se-simlayer .lv-bidir[data-port="${id}"]`;
  const lvOf = (id) => page.eval((s) => [...document.querySelector(s).classList].find((c) => /^lv-[01xzn]$/.test(c)), ctl(id));
  assert.equal(await lvOf(sda.id), 'lv-z');
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .lv-bidir-note')?.textContent || ''), /Bidirectional \(inout\) markers/);
  // 1 bit: Z -> 0 -> 1 -> Z
  for (const want of ['lv-0', 'lv-1', 'lv-z']) {
    await page.click(ctl(sda.id));
    await page.waitFor((s, w) => document.querySelector(s).classList.contains(w), [ctl(sda.id), want], { what: `sda ${want}` });
  }
  // a bus: the value editor, then Z releases it
  await page.click(ctl(data.id));
  await page.waitFor(() => document.querySelector('.lv-editor'));
  await page.fill('.lv-editor .lv-edit-in', '0x5A');
  await page.click('.lv-editor .btn.primary');
  await page.waitFor((s) => /5A/.test(document.querySelector(s).textContent), [ctl(data.id)], { what: 'data driven with 5A' });
  await page.click(ctl(data.id));
  await page.waitFor(() => document.querySelector('.lv-editor .lv-release'));
  await page.click('.lv-editor .lv-release');
  await page.waitFor((s) => document.querySelector(s).classList.contains('lv-z'), [ctl(data.id)], { what: 'data released' });
  await page.key('Escape');
});

const BIREG_VHD = `library ieee; use ieee.std_logic_1164.all;
entity bireg is
  port (clk, we, oe : in std_logic; data : inout std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0));
end bireg;
architecture rtl of bireg is
  signal r : std_logic_vector(3 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then if we = '1' then r <= data; end if; end if; end process;
  data <= r when oe = '1' else (others => 'Z');   -- tri-state driver
  q <= r;
end rtl;
`;
const BIREG_V = `module bireg(input clk, input we, input oe, inout [3:0] data, output [3:0] q);
  reg [3:0] r = 0;
  always @(posedge clk) if (we) r <= data;
  assign data = oe ? r : 4'bz;   // tri-state driver
  assign q = r;
endmodule
`;
const openTbw = async (page, name) => {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /^\s*Test Bench \(Wizard\)\s*$/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Finish');
  await page.waitDialog('Test Bench Wizard');
};
const simulateAll = async (page, tb) => {
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', tb);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
  await page.key('Enter');
  return page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return /TEST (PASSED|FAILED)/.test(t) ? t : null; }, [], { timeout: 30000, what: 'TEST PASSED / FAILED' });
};
const headers = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-table th')].map((e) => e.textContent));

uiTest('Test Bench Wizard: bidirectional register (VHDL), exhaustive drive / read pairs, expected bus values from the design: TEST PASSED in ISim', E, async (page) => {
  await makeProject(env, { name: 'IoTbV', top: 'bireg', files: { 'src/bireg.vhd': BIREG_VHD } });
  await page.openProject('IoTbV');
  await openTbw(page, 'tb_bireg');
  await next(page, 'Clock and Reset');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay select')[0].value), 'clk');
  await next(page, 'Input Vectors');
  // we, oe and the 4 bits driven on data: 64 combinations, each followed by a read vector
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tbw-modes').textContent), /6 input bit\(s\): 128 vector/);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tbw-ionote').textContent), /Bidirectional ports \(data\[4\]\): the generated vectors come in pairs/);
  await next(page, 'Vectors and Expected Outputs');
  assert.deepEqual(await headers(page), ['#', 'we', 'oe', 'data (drive)', 'q (expected)', 'data (expected)', '']);
  const drv = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-drv[data-port=data]')].slice(0, 4).map((i) => i.value));
  assert.deepEqual(drv, ['0000', 'Z', '0001', 'Z']);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tbw-iohint').textContent), /Z or empty releases the bus/);
  await page.click('.dlg-overlay .btn', { text: 'Fill Expected from Current Design' });
  await page.waitFor(() => /filled in from the current design/.test(document.querySelector('.dlg-overlay').textContent), [], { timeout: 20000 });
  // vector 0: we=0 oe=0, the bench drives 0000 -> the bus reads 0000; vector 1: released, nobody drives: not checked
  const exp = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-exp[data-port=data]')].slice(0, 2).map((i) => i.value));
  assert.deepEqual(exp, ['0000', '----']);
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /Vectors: 128[\s\S]*Bidirectional ports: data \(driven by the bench in 64 vector\(s\), released in 64\)/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.simTop === 'tb_bireg');
  assert.match(await readWs(env, 'IoTbV', 'sim/tb_bireg.vhd'), /constant VDRV/);
  assert.match(await simulateAll(page, 'tb_bireg'), /TEST PASSED: 128 vector/);
});

uiTest('Test Bench Wizard: bidirectional register (Verilog), typed drive / release rows: TEST PASSED in ISim', E, async (page) => {
  await makeProject(env, { name: 'IoTbVl', top: 'bireg', files: { 'src/bireg.v': BIREG_V } });
  await page.openProject('IoTbVl');
  await openTbw(page, 'tb_bireg');
  await page.eval(() => { const s = [...document.querySelectorAll('.dlg-overlay select')].find((x) => [...x.options].some((o) => o.value === 'verilog')); s.value = 'verilog'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await next(page, 'Clock and Reset');
  await next(page, 'Input Vectors');
  await page.click('.dlg-overlay input[name=tbw-mode][value=manual]');
  await next(page, 'Vectors and Expected Outputs');
  const add = () => page.click('.dlg-overlay .btn', { text: 'Add Vector' });
  await add(); await add(); await add();
  // write 1010 (the bench drives the bus), read it back (released: the register drives it), write 3, read it
  const plan = [
    { we: '1', oe: '0', drv: '1010', q: '1010', data: '1010' },
    { we: '0', oe: '1', drv: '', q: '1010', data: '1010' },
    { we: '1', oe: '0', drv: '0x3', q: '0011', data: '' },
    { we: '0', oe: '1', drv: 'Z', q: '0011', data: '0011' },
  ];
  for (const [k, r] of plan.entries()) {
    await page.fill('.dlg-overlay .tbw-in[data-port=we]', r.we, { index: k });
    await page.fill('.dlg-overlay .tbw-in[data-port=oe]', r.oe, { index: k });
    await page.fill('.dlg-overlay .tbw-drv[data-port=data]', r.drv, { index: k });
    await page.fill('.dlg-overlay .tbw-exp[data-port=q]', r.q, { index: k });
    await page.fill('.dlg-overlay .tbw-exp[data-port=data]', r.data, { index: k });
  }
  // a bad drive value is refused with the vector
  await page.fill('.dlg-overlay .tbw-drv[data-port=data]', '1-1', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /vector 0, data \(drive\): '1-1': a driven bit cannot be '-'/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'drive error' });
  await page.fill('.dlg-overlay .tbw-drv[data-port=data]', '1010', { index: 0 });
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /Bidirectional ports: data \(driven by the bench in 2 vector\(s\), released in 2\)/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.simTop === 'tb_bireg');
  assert.match(await readWs(env, 'IoTbVl', 'sim/tb_bireg.v'), /reg \[3:0\] data_drv = 4'bz;/);
  const out = await simulateAll(page, 'tb_bireg');
  assert.match(out, /TEST PASSED: 4 vector/, out);
});
