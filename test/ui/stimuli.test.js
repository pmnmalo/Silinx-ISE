// UI: the stimuli drawn on the waveforms of ISim (#336), as the HDL Bencher of the old ISE — a module simulated
// without a test bench: Edit Stimuli, its timing (the clock found), clicks on the cycles of the inputs (the
// simulation runs again at once), a bus value typed in, an expected output wrong (the mismatch in red, in the
// bar and the console) then filled in from the simulation, saved in the project and run again when ISim opens,
// Save as Test Bench (a simulation source that passes), and the texts in Portuguese; a bus expanded and its bits
// clicked one at a time (#919), in the modern and classic interfaces and in the Tasks interface's Simulate.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CTR = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity ctr is
  port (clk, rst, en : in std_logic; d : in std_logic_vector(3 downto 0); load : in std_logic; q : out std_logic_vector(3 downto 0); tc : out std_logic);
end ctr;
architecture rtl of ctr is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif load = '1' then c <= unsigned(d); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
  tc <= '1' when c = "1111" else '0';
end rtl;
`;
const DOC = '.doc:not([hidden])';
const simTime = (page, ps) => page.waitFor((re) => new RegExp(re).test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [`Sim Time: ${ps} ps`], { what: `sim time ${ps} ps`, timeout: 20000 });
// client point of time t (ps) on the wave canvas, in row `row`
const waveAt = (page, t, row) => page.eval((tt, r) => {
  const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
  return { x: c.left + (tt - s.t0) / s.scale, y: c.top + 30 + r * 20 + 10 - s.scrollY };
}, t, row);
const rowOf = (page, name) => page.eval((n) => window.Silinx.active.view.state.rows.findIndex((r) => r.sig?.name === n), name);
const stim = (page) => page.eval(() => JSON.parse(JSON.stringify(window.Silinx.active.view.state.stim.m)));
const status = (page) => page.eval((d) => document.querySelector(`${d} .isim-stim-st`).textContent, DOC);
const value = (page, name) => page.eval((n) => { const s = window.Silinx.active.view.state.rows.find((r) => r.sig?.name === n).sig; return [...Array(s.val.w)].map((_, i) => { const b = BigInt(s.val.w - 1 - i); return (s.val.x >> b) & 1n ? ((s.val.v >> b) & 1n ? 'z' : 'x') : String((s.val.v >> b) & 1n); }).join(''); }, name);
const consoleText = (page) => page.eval((d) => Array.from(document.querySelector(`${d} .isim-console`)?.children || [], (e) => e.textContent).join('\n'), DOC);
const saved = async (pj) => (await env.server.api('GET', `/api/projects/${pj}`)).stimuli?.ctr;
// a click on cycle k of a port (P = the cycle in ps)
const clickCycle = async (page, name, k, P) => page.click(await waveAt(page, k * P + P / 2, await rowOf(page, name)));
// (a new ISim window: not the one open before)
const simulate = async (page, mod) => {
  await page.eval(() => { window.__oldView = window.Silinx.active?.view || null; });
  await page.treeRow('#hier', mod);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor((m) => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && window.Silinx.active.view !== window.__oldView
    && document.querySelector('.doc:not([hidden]) .isim-title-text')?.textContent === m, [mod], { what: `ISim of ${mod}`, timeout: 20000 });
};

uiTest('ISim stimuli (#336): Edit Stimuli, timing, clicks on the inputs, a bus value, expected outputs checked and filled in, saved, Save as Test Bench, Portuguese', E, async (page) => {
  await makeProject(env, { name: 'StimPj', top: 'ctr', files: { 'src/ctr.vhd': CTR } });
  await page.openProject('StimPj');
  await page.click('input[name=view][value=sim]');
  await simulate(page, 'ctr');
  await simTime(page, '1,000,000');

  // ---- the button with its label, whole, next to its icon (#853)
  assert.deepEqual(await page.eval((d) => {
    const b = document.querySelector(`${d} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`), l = b.querySelector('.tb-label'), r = l.getBoundingClientRect();
    return { label: l.textContent, icon: !!b.querySelector('svg'), shown: r.width > 40 && r.height > 0, whole: b.scrollWidth <= b.clientWidth && r.right <= b.getBoundingClientRect().right };
  }, DOC), { label: 'Edit Stimuli', icon: true, shown: true, whole: true });
  // ---- Edit Stimuli: the timing dialog, its clock found (clk); 8 cycles of 20 ns
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=cycles]`), [DOC], { what: 'Stimulus Timing' });
  assert.deepEqual(await page.eval((d) => { const q = (n) => document.querySelector(`${d} .isim-stim-dlg [name=${n}]`); return [q('clock').value, [...q('clock').options].map((o) => o.value), q('period').value, q('step').disabled]; }, DOC),
    ['clk', ['', 'clk', 'rst', 'en', 'load'], '20', true]);
  await page.fill(`${DOC} .isim-stim-dlg [name=cycles]`, '8');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await simTime(page, '160,000');
  assert.equal(await status(page), '8 cycles (clock clk, period 20 ns): no expected outputs');
  assert.ok(!await page.eval((d) => document.querySelector(`${d} .isim-stimbar`).hidden, DOC));
  const P = 20000;

  // ---- clicks: en from cycle 2 (0 → 1, up to the end); rst 1 in cycle 0 then 0 from cycle 1 (from cycle 1: 1 → Z → X → 0);
  // the simulation runs again after each
  await clickCycle(page, 'en', 2, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.en.join('') === '00111111', [], { what: 'en painted' });
  await simTime(page, '160,000');
  await clickCycle(page, 'rst', 0, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '11111111', [], { what: 'rst 1' });
  await clickCycle(page, 'rst', 1, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '1ZZZZZZZ', [], { what: 'rst Z from cycle 1' });
  await clickCycle(page, 'rst', 1, P);
  await clickCycle(page, 'rst', 1, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '10000000', [], { what: 'rst 1 then 0' });
  await simTime(page, '160,000');
  // reset in cycle 0, then counting in cycles 2..7: 6
  assert.equal(await value(page, 'q'), '0110');
  // ---- a bus: d = h9 from cycle 4, load 1 in cycle 4 only: q = 9 + 3 = 12 at the end
  await clickCycle(page, 'd', 4, P);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=value]`), [DOC], { what: 'Input Value' });
  assert.deepEqual(await page.eval((d) => [document.querySelector(`${d} .isim-dlg-title`).textContent, document.querySelector(`${d} .isim-stim-dlg [name=sig]`).value, document.querySelector(`${d} .isim-stim-dlg [name=k]`).value], DOC), ['Input Value✕', 'd', '4']);
  await page.fill(`${DOC} .isim-stim-dlg [name=value]`, '2z0q');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .isim-stim-dlg .isim-dlg-err`).textContent, DOC), "'2z0q' is not a value (bits 0 1 Z X, h… hexadecimal or d… decimal)");
  await page.fill(`${DOC} .isim-stim-dlg [name=value]`, 'h9');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await clickCycle(page, 'load', 4, P);
  await clickCycle(page, 'load', 5, P);
  await clickCycle(page, 'load', 5, P);
  await clickCycle(page, 'load', 5, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.load.join('') === '00001000', [], { what: 'load in cycle 4' });
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '1100');
  const m = await stim(page);
  assert.deepEqual([m.inputs.d.join(' '), m.clock, m.cycles], ['0000 0000 0000 0000 1001 1001 1001 1001', 'clk', 8]);

  // ---- expected: tc 1 in cycle 7 (wrong: q is 12) → a mismatch, then Fill Expected Outputs → all right.
  // The saves of the project before Fill held 1 s on their way (a loaded machine, #593): the save of Fill must
  // still be the one written last (the saves one at a time, in order), not overwritten by an older one
  await page.eval(() => {
    const f = window.fetch;
    window.fetch = async (url, o) => {
      if (o?.method === 'PUT' && /\/api\/projects\/StimPj$/.test(String(url)) && JSON.parse(o.body).stimuli?.ctr?.expected?.q?.[7] !== '1100') await new Promise((r) => setTimeout(r, 1000));
      return f(url, o);
    };
    window.__fetch = f;
  });
  await clickCycle(page, 'tc', 7, P);
  await clickCycle(page, 'tc', 7, P);
  await page.waitFor((d) => /1 mismatch\(es\)$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'the mismatch' });
  assert.ok(await page.eval((d) => document.querySelector(`${d} .isim-stim-st`).classList.contains('bad'), DOC));
  assert.deepEqual(await page.eval(() => window.Silinx.active.view.state.stim.bad), [{ port: 'tc', k: 7, expected: '1', got: '0' }]);
  await page.click(`${DOC} .isim-stimbar [data-stim=fill]`);
  await page.waitFor((d) => /expected outputs OK$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'expected OK' });
  assert.deepEqual((await stim(page)).expected.q, ['0000', '0000', '0001', '0010', '1001', '1010', '1011', '1100']);
  assert.match(await consoleText(page), /Stimuli: the expected outputs filled in from the simulation/);
  // saved in the project
  await page.waitFor(async () => { const r = await fetch('/api/projects/StimPj'); const j = await r.json(); return j.stimuli?.ctr?.expected?.q?.[7] === '1100'; }, [], { what: 'stimuli saved' });
  assert.deepEqual((await saved('StimPj')).inputs.en, ['0', '0', '1', '1', '1', '1', '1', '1']);
  // (no save left on its way: the one written last is Fill's)
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual((await saved('StimPj')).expected.q, ['0000', '0000', '0001', '0010', '1001', '1010', '1011', '1100']);
  await page.eval(() => { window.fetch = window.__fetch; });

  // ---- in Portuguese: the bar and the timing dialog
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stimbar`)).concat(window.__uiTexts(document.querySelector(`${d} .isim-toolbar`))), DOC);
  const en = await texts();
  await setLang('pt');
  const pt = await texts();
  assert.deepEqual(untranslated(en, pt), []);
  assert.ok(pt.includes('Editar Estímulos') && pt.includes('Preencher Saídas Esperadas') && pt.includes('8 ciclos (relógio clk, período 20 ns): saídas esperadas certas'), pt.join(' | '));
  await page.click(`${DOC} .isim-stimbar [data-stim=timing]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg`), [DOC], { what: 'timing dialog' });
  await setLang('en');
  const enD = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stim-dlg`)), DOC);
  await setLang('pt');
  const ptD = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stim-dlg`)), DOC);
  assert.deepEqual(untranslated(enD, ptD, [/^@?(clk|rst|en|load)$/]), []);
  assert.ok(ptD.includes('Temporização dos Estímulos'), ptD.join(' | '));
  await setLang('en');
  await page.click(`${DOC} .isim-stim-dlg [data-a=cancel]`);

  // ---- ISim opened again: the saved stimuli run at once
  await simulate(page, 'ctr');
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '1100');

  // ---- Save as Test Bench: tb_ctr.vhd, a simulation source; simulated, it passes
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.click(`${DOC} .isim-stimbar [data-stim=save]`);
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('input'), [], { what: 'test bench name' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('input').value), 'tb_ctr');
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'OK' });
  await page.waitFor(async () => (await (await fetch('/api/projects/StimPj')).json()).files.some((f) => f.path === 'src/tb_ctr.vhd' && f.role === 'sim'), [], { what: 'tb_ctr.vhd, simulation', timeout: 20000 });
  await simulate(page, 'tb_ctr');
  await page.waitFor((d) => /TEST PASSED: 8 vector/.test(Array.from(document.querySelector(`${d} .isim-console`)?.children || [], (e) => e.textContent).join('\n')), [DOC], { what: 'TEST PASSED', timeout: 20000 });
  assert.doesNotMatch(await consoleText(page), /Error|Warning/);
  assert.deepEqual(page.dialogs, []);
});

// a test bench simulated: Edit Stimuli draws its unit under test's inputs (its signals forced over what the bench
// drives), the stimuli saved for the test bench; Save as Test Bench writes another one for the module
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb_ctr is end tb_ctr;
architecture sim of tb_ctr is
  signal clk, rst, en, load : std_logic := '0';
  signal d, q : std_logic_vector(3 downto 0);
  signal tc : std_logic;
begin
  uut : entity work.ctr port map (clk => clk, rst => rst, en => en, d => d, load => load, q => q, tc => tc);
  clk <= not clk after 5 ns;
  d <= "0000";
end sim;
`;
uiTest('ISim stimuli (#336) of a test bench: the inputs of its unit under test, forced over the bench, saved for the bench', E, async (page) => {
  await makeProject(env, { name: 'StimTb', top: 'ctr', files: { 'src/ctr.vhd': CTR, 'sim/tb_ctr.vhd': TB }, roles: { 'sim/tb_ctr.vhd': 'sim' } });
  await page.openProject('StimTb');
  await page.click('input[name=view][value=sim]');
  await simulate(page, 'tb_ctr');
  await simTime(page, '1,000,000');
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=cycles]`), [DOC], { what: 'Stimulus Timing' });
  // the unit under test's inputs (ctr: clk rst en d load), its clock found
  assert.deepEqual(await page.eval((d) => { const q = (n) => document.querySelector(`${d} .isim-stim-dlg [name=${n}]`); return [q('clock').value, [...q('clock').options].map((o) => o.value)]; }, DOC), ['clk', ['', 'clk', 'rst', 'en', 'load']]);
  assert.match(await page.eval((d) => document.querySelector(`${d} .isim-stim-dlg .isim-dlg-hint`).textContent, DOC), /^The inputs of ctr \(tb_ctr\.uut\) as a grid of cycles/);
  await page.fill(`${DOC} .isim-stim-dlg [name=cycles]`, '6');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await simTime(page, '120,000');
  // en from cycle 1 (the bench leaves it 0): q counts 5; the clock is the stimuli's (period 20 ns), not the bench's 10 ns
  await clickCycle(page, 'en', 1, 20000);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.en.join('') === '011111', [], { what: 'en painted' });
  await simTime(page, '120,000');
  assert.equal(await value(page, 'q'), '0101');
  await page.waitFor(async () => { const j = await (await fetch('/api/projects/StimTb')).json(); return j.stimuli?.tb_ctr?.inputs?.en?.[1] === '1' && !j.stimuli?.ctr; }, [], { what: 'saved for tb_ctr' });
  // Save as Test Bench: for ctr, tb_ctr exists: tb_ctr_2
  await page.click(`${DOC} .isim-stimbar [data-stim=fill]`);
  await page.click(`${DOC} .isim-stimbar [data-stim=save]`);
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('input'), [], { what: 'test bench name' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('input').value), 'tb_ctr_2');
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'OK' });
  await page.waitFor(async () => (await (await fetch('/api/projects/StimTb')).json()).files.some((f) => f.path === 'src/tb_ctr_2.vhd' && f.role === 'sim'), [], { what: 'tb_ctr_2.vhd', timeout: 20000 });
  await simulate(page, 'tb_ctr_2');
  await page.waitFor((d) => /TEST PASSED: 6 vector/.test(Array.from(document.querySelector(`${d} .isim-console`)?.children || [], (e) => e.textContent).join('\n')), [DOC], { what: 'TEST PASSED', timeout: 20000 });
  assert.deepEqual(page.dialogs, []);
});

// #919: a bus expanded, its bits edited one at a time. The line of the waves of a port (or of its bit `bit`, a bus
// expanded: its bits after it, the leftmost first), the rows being the module's ports, no groups
const lineOf = (page, name, bit = null) => page.eval((n, b) => {
  let line = 0;
  for (const r of window.Silinx.active.view.state.rows) {
    const t = r.sig?.t;
    if (r.sig?.name === n) return b == null ? line : line + 1 + (t.left >= t.right ? t.left - b : b - t.left);
    line += 1 + (r.expanded ? t.w : 0);
  }
  return -1;
}, name, bit);
const clickLine = async (page, line, k, P) => page.click(await page.eval((tt, l) => {
  const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
  return { x: c.left + (tt - s.t0) / s.scale, y: c.top + 30 + l * 20 + 10 - s.scrollY };
}, k * P + P / 2, line));
// a bus's twisty in the names column: expanded (or collapsed)
const expand = async (page, name, open = true) => {
  const line = await lineOf(page, name);
  await page.click(await page.eval((l) => {
    const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-names').getBoundingClientRect();
    return { x: c.left + 8, y: c.top + 30 + l * 20 + 10 - s.scrollY };
  }, line));
  await page.waitFor((n, o) => window.Silinx.active.view.state.rows.find((r) => r.sig?.name === n).expanded === o, [name, open], { what: `${name} ${open ? 'expanded' : 'collapsed'}` });
};
// Edit Stimuli on, 8 cycles of 20 ns (clk the clock); then d's bits clicked: d(3) from cycle 2, d(0) in cycle 2 only
// (0 → 1, then 1 → Z → X → 0 from cycle 3), load in cycle 2: q loads 1001 and keeps it (en 0)
async function editBits(page) {
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=cycles]`), [DOC], { what: 'Stimulus Timing' });
  await page.fill(`${DOC} .isim-stim-dlg [name=cycles]`, '8');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await simTime(page, '160,000');
  const P = 20000;
  await expand(page, 'd');
  await clickLine(page, await lineOf(page, 'd', 3), 2, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.d.join(' ') === '0000 0000 1000 1000 1000 1000 1000 1000', [], { what: 'd(3) from cycle 2' });
  assert.ok(!await page.eval((d) => document.querySelector(`${d} .isim-stim-dlg`), DOC), 'no value dialog for a bit');
  await clickLine(page, await lineOf(page, 'd', 0), 2, P);
  for (let n = 0; n < 3; n++) await clickLine(page, await lineOf(page, 'd', 0), 3, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.d.join(' ') === '0000 0000 1001 1000 1000 1000 1000 1000', [], { what: 'd(0) in cycle 2' });
  await clickLine(page, await lineOf(page, 'load'), 2, P);
  for (let n = 0; n < 3; n++) await clickLine(page, await lineOf(page, 'load'), 3, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.load.join('') === '00100000', [], { what: 'load in cycle 2' });
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '1001');
  return P;
}

uiTest('#919 ISim stimuli: a bus expanded, its bits clicked one at a time (an input\'s, an expected output\'s), the bus whole again, saved, Save as Test Bench, Portuguese', E, async (page) => {
  await makeProject(env, { name: 'StimBits', top: 'ctr', files: { 'src/ctr.vhd': CTR } });
  await page.openProject('StimBits');
  await page.click('input[name=view][value=sim]');
  await simulate(page, 'ctr');
  await simTime(page, '1,000,000');
  const P = await editBits(page);
  // q's MSB expected 0 in cycle 7 (q is 1001): a mismatch on its bit; a click again: 1, all right (d collapsed: q's
  // bits in view)
  await expand(page, 'd', false);
  await expand(page, 'q');
  await clickLine(page, await lineOf(page, 'q', 3), 7, P);
  await page.waitFor((d) => /1 mismatch\(es\)$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'the mismatch' });
  assert.deepEqual(await page.eval(() => window.Silinx.active.view.state.stim.bad), [{ port: 'q', k: 7, expected: '0---', got: '1001' }]);
  await clickLine(page, await lineOf(page, 'q', 3), 7, P);
  await page.waitFor((d) => /expected outputs OK$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'expected OK' });
  assert.deepEqual((await stim(page)).expected.q, ['----', '----', '----', '----', '----', '----', '----', '1---']);
  // the bus's row: its value dialog, the note on its bits; 0011 from cycle 2 up to d's next change (cycle 3)
  await clickLine(page, await lineOf(page, 'd'), 2, P);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=value]`), [DOC], { what: 'Input Value' });
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .isim-stim-dlg .isim-dlg-note`)].map((n) => n.textContent), DOC),
    ['Bits, most significant first (0 1 Z X), h… hexadecimal or d… decimal; it holds up to the next change.', 'Expand the bus to change one of its bits: a click on its wave, as on a 1-bit signal.']);
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const dlgTexts = () => page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stim-dlg`)), DOC);
  const en = await dlgTexts();
  await setLang('pt');
  const pt = await dlgTexts();
  await setLang('en');
  assert.deepEqual(untranslated(en, pt, [/^@?(d|2|0000)$/]), []);
  assert.ok(pt.includes('Expanda o barramento para mudar um dos seus bits: um clique na sua onda, como num sinal de 1 bit.'), pt.join(' | '));
  await page.fill(`${DOC} .isim-stim-dlg [name=value]`, '0011');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.d.join(' ') === '0000 0000 0011 1000 1000 1000 1000 1000', [], { what: 'd whole in cycle 2' });
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '0011');
  await page.click(`${DOC} .isim-stimbar [data-stim=fill]`);
  await page.waitFor(async () => { const j = await (await fetch('/api/projects/StimBits')).json(); return j.stimuli?.ctr?.expected?.q?.[7] === '0011'; }, [], { what: 'stimuli saved' });
  assert.deepEqual((await saved('StimBits')).inputs.d, ['0000', '0000', '0011', '1000', '1000', '1000', '1000', '1000']);
  // Save as Test Bench: the bits as edited, the test bench passes
  await page.click(`${DOC} .isim-stimbar [data-stim=save]`);
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('input'), [], { what: 'test bench name' });
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'OK' });
  await page.waitFor(async () => (await (await fetch('/api/projects/StimBits')).json()).files.some((f) => f.path === 'src/tb_ctr.vhd' && f.role === 'sim'), [], { what: 'tb_ctr.vhd', timeout: 20000 });
  await simulate(page, 'tb_ctr');
  await page.waitFor((d) => /TEST PASSED: 8 vector/.test(Array.from(document.querySelector(`${d} .isim-console`)?.children || [], (e) => e.textContent).join('\n')), [DOC], { what: 'TEST PASSED', timeout: 20000 });
  assert.doesNotMatch(await consoleText(page), /Error|Warning/);
  assert.deepEqual(page.dialogs, []);
});

// the Tasks interface (a development build's, #838): its Simulate hosts the same ISim, the bits edited there too
uiTest('#919 ISim stimuli in Tasks ▸ Simulate: a bus expanded, its bits clicked one at a time', E, async (page) => {
  await makeProject(env, { name: 'StimBitsTasks', top: 'ctr', files: { 'src/ctr.vhd': CTR } });
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.openProject('StimBitsTasks');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-empty button');
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && document.querySelector('.doc:not([hidden]) .isim .isim-wavewin'), [], { what: 'ISim', timeout: 30000 });
  await simTime(page, '1,000,000');
  await editBits(page);
  await page.waitFor(async () => (await (await fetch('/api/projects/StimBitsTasks')).json()).stimuli?.ctr?.inputs?.d?.[2] === '1001', [], { what: 'stimuli saved' });
  assert.deepEqual(page.dialogs, []);
}, { build: { commit: 'abc1234', date: '2026-10-21 12:00' } });
