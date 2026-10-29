// UI: the Test Bench Wizard's vectors page (#405: web/js/tbwizard-vectors.js out of testBenchWizard in tbwizard.js):
// vectors typed in for a combinational adder: the table's columns, the note's count, a bad value refused with the
// vector and port named, the expected values filled in from the current design and cleared, a vector deleted, and
// the vectors the summary and the generated bench have. Whole runs of the wizard: test/ui/tbwizard.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newSourceWizardOf } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ADDER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity adder is
  port (a, b : in std_logic_vector(1 downto 0); cin : in std_logic; s : out std_logic_vector(1 downto 0); cout : out std_logic);
end adder;
architecture rtl of adder is
  signal t : unsigned(2 downto 0);
begin
  t <= resize(unsigned(a), 3) + resize(unsigned(b), 3) + ("00" & cin);
  s <= std_logic_vector(t(1 downto 0));
  cout <= t(2);
end rtl;
`;

const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
const rowsOf = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-table tr')].slice(1).map((r) => [...r.querySelectorAll('input')].map((i) => i.value)));
const note = (page) => page.eval(() => document.querySelector('.dlg-overlay .tbw-table + .hint').textContent.replace(/\. Values:.*/, ''));

uiTest('Test Bench Wizard, the vectors page: typed in, a bad value refused, expected values from the design and cleared, a vector deleted', E, async (page) => {
  await makeProject(env, { name: 'TbwVec', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('TbwVec');
  await newSourceWizardOf(page, 'Test Bench', 'tb_vec', 'Test Bench Wizard');
  await next(page, 'Clock and Reset');
  await next(page, 'Input Vectors');
  await page.click('.dlg-overlay input[name=tbw-mode][value=manual]');
  await next(page, 'Vectors and Expected Outputs');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-table th')].map((t) => t.textContent)),
    ['#', 'a', 'b', 'cin', 's (expected)', 'cout (expected)', '']);
  // three vectors: 01 + 10 + 0, 11 + 11 + 1, 00 + 01 + 1
  const add = () => page.click('.dlg-overlay .btn', { text: 'Add Vector' });
  await add(); await add();
  for (const [k, [a, b, cin]] of [['01', '10', '0'], ['11', '11', '1'], ['00', '01', '1']].entries()) {
    await page.fill('.dlg-overlay .tbw-in[data-port=a]', a, { index: k });
    await page.fill('.dlg-overlay .tbw-in[data-port=b]', b, { index: k });
    await page.fill('.dlg-overlay .tbw-in[data-port=cin]', cin, { index: k });
  }
  assert.equal(await note(page), '3 vector(s), 0 with expected values');
  // a bad value: Next > refused, the vector and the port named
  await page.fill('.dlg-overlay .tbw-in[data-port=b]', 'q', { index: 1 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /vector 1, input b: /.test(document.querySelector('.dlg-overlay').textContent), [], { what: 'the bad value refused' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent), 'Vectors and Expected Outputs');
  await page.fill('.dlg-overlay .tbw-in[data-port=b]', '11', { index: 1 });
  // the expected values from a simulation of the design
  await page.click('.dlg-overlay .btn', { text: 'Fill Expected from Current Design' });
  await page.waitFor(() => /filled in from the current design/.test(document.querySelector('.dlg-overlay').textContent), [], { what: 'expected values filled in' });
  assert.deepEqual(await rowsOf(page), [['01', '10', '0', '11', '0'], ['11', '11', '1', '11', '1'], ['00', '01', '1', '10', '0']]);
  assert.equal(await note(page), '3 vector(s), 3 with expected values');
  await page.click('.dlg-overlay .btn', { text: 'Clear Expected' });
  assert.deepEqual(await rowsOf(page), [['01', '10', '0', '', ''], ['11', '11', '1', '', ''], ['00', '01', '1', '', '']]);
  await page.click('.dlg-overlay .btn', { text: 'Fill Expected from Current Design' });
  await page.waitFor(() => /filled in from the current design/.test(document.querySelector('.dlg-overlay').textContent), [], { what: 'expected values filled in again' });
  // vector 1 deleted
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay .tbw-table tr')][2].querySelector('button').click());
  assert.deepEqual(await rowsOf(page), [['01', '10', '0', '11', '0'], ['00', '01', '1', '10', '0']]);
  assert.equal(await note(page), '2 vector(s), 2 with expected values');
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), /\nVectors: 2 \(I will type the vectors in \(starts with one empty vector\)\)\nExpected values: 2 vector\(s\) checked\n/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'sim/tb_vec.vhd'), [], { what: 'the bench written' });
  const tb = await readWs(env, 'TbwVec', 'sim/tb_vec.vhd');
  assert.match(tb, /constant VEXP/);
  // (logged after the project is reloaded, later than the file is registered: waited for)
  await page.waitConsole(/Test Bench Wizard: created sim\/tb_vec\.vhd \(2 vector\(s\)\) for 'adder'/);
});
