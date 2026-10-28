// UI (#1590): a C++ source (.cpp) in the project: a module as a .c one is, its Design row [C++] (the base) and its HDL,
// its C Synthesis (HLS) processes (the C simulation of its test bench with std::cout); New Source ▸ C++ Function (HLS);
// Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const SRC = `#include <iostream>
namespace dsp {
  void twice(int x, int &y) { y = 2 * x; }
}
int main() {
  int y = 0;
  dsp::twice(21, y);
  std::cout << "y=" << y << std::endl;
  return y == 42 ? 0 : 1;
}
`;
const row = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === n);
  return r ? [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`) : null;
}, name);

uiTest('#1590 a C++ source: its Design row [C++] and its HDL, its C Simulation (std::cout); New Source ▸ C++ Function (HLS); Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CppMod', top: 'twice', files: { 'src/twice.cpp': SRC } });
  await page.openProject('CppMod');
  await page.leftTab('design');
  await page.showMessages();
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'twice'), [], { what: 'the module twice' });
  assert.deepEqual(await row(page, 'twice'), ['C++*', 'VHDL']);
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.lib.modules.get('twice').ports.map((p) => p.name)), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'y', 'y_ap_vld']);
  await page.treeRow('#hier', 'twice');
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/Process "C Simulation" completed successfully/);
  assert.match(await page.consoleText(), /\ny=42\nmain\(\) returned 0; 1 call\(s\) of 'twice'\./);
  // New Source ▸ C++ Function (HLS): a .cpp from the template, a module at once, opened in the editor; its C simulation
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await pickSourceType(page, 'C++ Function (HLS)');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'adder4');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.SilinxApp.S.fileTree.includes('src/adder4.cpp') && window.SilinxApp.S.modules.some((m) => m.name === 'adder4'), [], { what: 'adder4.cpp and its module' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/adder4.cpp', [], { what: 'adder4.cpp opened' });
  assert.match(await page.eval(() => window.Silinx.active.editor.getValue()), /void adder4\(ap_uint<4> a, ap_uint<4> b, ap_uint<5> &sum, bool &carry\)/);
  assert.deepEqual(await row(page, 'adder4'), ['C++*', 'VHDL']);
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.lib.modules.get('adder4').ports.map((p) => p.name)), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'b', 'sum', 'sum_ap_vld', 'carry', 'carry_ap_vld']);
  await page.treeRow('#hier', 'adder4');
  await page.treeRow('#procs', 'C Simulation', { dbl: true, exact: true });
  await page.waitConsole(/9 \+ 8 = 17 \(carry 1\)\nmain\(\) returned 0; 1 call\(s\) of 'adder4'\./);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].some((x) => x.textContent.trim() === 'Simulação de C')));
  await page.menu('Projeto', 'Nova Fonte…');
  await page.waitDialog();
  assert.ok((await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()))).includes('Função C++ (HLS)'));
  await page.eval(() => document.querySelector('.dlg-overlay .dlg-x').click());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
