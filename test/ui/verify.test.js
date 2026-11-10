// UI: Verify Equivalence (#3177, web/js/verify.js): a module's right-click Verify Equivalence… (both interfaces; the ISE
// style's Simulation view has it in its Processes too) asks for the reference module (one named after the module
// proposed) and the depth; Yosys's SAT solver in the page's worker; a difference: its messages in the console, the
// counterexample's test bench written into the project (sim/verify_cnt.vhd, a simulation source) and simulated, SSim
// showing it, the same difference in its messages; an equivalent reference: proved; Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ISE = process.env.SILINX_UI_INTERFACE === 'ise';
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

const CNT = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0)); end cnt;
architecture rtl of cnt is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end rtl;
`;
const REF = (name, next) => `module ${name} (input clk, rst, en, output [3:0] q);
  reg [3:0] c = 0;
  assign q = c;
  always @(posedge clk) if (rst) c <= 0; else if (en) c <= ${next};
endmodule
`;

// the module's right-click Verify Equivalence…: its dialog
async function openVerify(page, label = 'Verify Equivalence…') {
  await page.treeRow('#hier', 'cnt', { right: true });
  await page.click('body > .menu-popup .mi', { text: label });
  await page.waitDialog();
  return page.eval(() => {
    const d = [...document.querySelectorAll('.dlg-overlay')].pop();
    return { title: d.querySelector('.dlg-title span').textContent, labels: [...d.querySelectorAll('.dlg-body p, .dlg-body label')].map((l) => l.textContent),
      options: [...d.querySelectorAll('select option')].map((o) => o.value), reference: d.querySelector('select').value, depth: d.querySelector('input').value,
      buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent) };
  });
}
const lines = (page, from) => page.eval((f) => { const l = window.__console().split('\n'); return l.slice(l.lastIndexOf(f)); }, from);

uiTest('#3177 Verify Equivalence: the reference asked, a counterexample simulated in SSim; proved; the ISE style\'s Processes; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'VerifyUi', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/cnt_ref.v': REF('cnt_ref', '(c == 9) ? 0 : c + 1'), 'sim/hex.v': REF('hex', 'c + 1') } });
  await page.openProject('VerifyUi');
  // the ISE style interface: the Simulation view's Processes have it too (the module a root there: no test bench yet)
  if (ISE) {
    await page.setView('sim');
    await page.treeRow('#hier', 'cnt');
    await page.treeRow('#procs', 'Verify Equivalence…', { dbl: true, exact: true });
    assert.equal(await page.waitDialog(), 'Verify Equivalence');
    await page.click('.dlg-buttons .btn', { text: 'Cancel' });
    await page.waitNoDialog();
    await page.setView('impl');
  }
  const dlg = await openVerify(page);
  assert.deepEqual(dlg, { title: 'Verify Equivalence', labels: ['Proves that the module gives the outputs of the reference module for every input sequence, or shows the first clock cycle where they differ.',
    'Reference module:', 'Depth (clock cycles):'], options: ['cnt_ref', 'hex'], reference: 'cnt_ref', depth: '20', buttons: ['Verify', 'Cancel'] });
  await page.click('.dlg-buttons .btn.primary');
  await page.waitConsole(/Process "Verify Equivalence" failed/, { timeout: 60000 });
  assert.deepEqual((await lines(page, 'Started : "Verify Equivalence".')).slice(0, 7), ['Started : "Verify Equivalence".', '',
    'Verifying \'cnt\' against its reference \'cnt_ref\': Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.',
    'ERROR:Verify - \'cnt\' differs from its reference \'cnt_ref\' at clock cycle 11: q = 1010, the reference\'s q = 0000.',
    'The counterexample\'s test bench: sim/verify_cnt.vhd (it replays the 11 clock cycle(s) in the simulator, both modules side by side).', '',
    'Process "Verify Equivalence" failed']);
  // the test bench in the project, a simulation source; SSim open on it, its messages the same difference
  assert.match(await readWs(env, 'VerifyUi', 'sim/verify_cnt.vhd'), /^-- Counterexample of Verify \(Silinx\): 'cnt' differs from its reference 'cnt_ref' at clock cycle 11 \(q\)\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'isim:verify_cnt'), [], { what: 'SSim on verify_cnt', timeout: 60000 });
  await page.waitConsole(/clock cycle 11: q = 1010, the reference's q = 0000[\s\S]*VERIFY FAILED: 'cnt' differs from its reference 'cnt_ref' at clock cycle 11/, { timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.project.files.find((f) => f.path === 'sim/verify_cnt.vhd')?.role), 'sim');
  // an equivalent reference: proved; the test bench left out of the references
  const again = await openVerify(page);
  assert.deepEqual([again.options, again.reference], [['cnt_ref', 'hex'], 'cnt_ref']);
  await page.eval(() => { const s = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('select'); s.value = 'hex'; });
  await page.click('.dlg-buttons .btn.primary');
  await page.waitConsole(/Proved: 'cnt' gives the outputs of 'hex' for every input sequence \(by induction over 1 clock cycle\(s\)\)\.\n\nProcess "Verify Equivalence" completed successfully/, { timeout: 60000 });
  // Portuguese: the menu's item and the dialog
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const pt = await openVerify(page, 'Verificar Equivalência…');
  assert.deepEqual([pt.title, pt.labels, pt.buttons], ['Verificar Equivalência', ['Prova que o módulo dá as saídas do módulo de referência para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que diferem.',
    'Módulo de referência:', 'Profundidade (ciclos de relógio):'], ['Verificar', 'Cancelar']]);
  await page.click('.dlg-buttons .btn', { text: 'Cancelar' });
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  noWarnings(page);
}, { timeout: 180000 });
