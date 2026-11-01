// UI: the iCE40's devices in New Project: its parts and packages offered, no speed grade, a project with its PCF
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('the iCE40 in the New Project wizard: its parts and packages, no speed grade, constraints/top.pcf', E, async (page) => {
  const r = await page.eval(async () => {
    const { newProjectWizard } = await import('/js/wizards.js');
    const { api } = await import('/js/api.js');
    newProjectWizard();
    const tick = () => new Promise(res => setTimeout(res, 50));
    const q = sel => document.querySelector(sel);
    let name;
    for (let i = 0; i < 100 && !name; i++) { await tick(); name = q('.wiz-main input[type=text], .wiz-main input:not([type])'); }
    name.value = 'ice40dev'; name.dispatchEvent(new Event('input', { bubbles: true }));
    const next = () => [...document.querySelectorAll('button')].find(b => /^(Next >|Seguinte >)/.test(b.textContent.trim()));
    let fam;
    for (let i = 0; i < 20 && !fam; i++) {
      fam = [...document.querySelectorAll('.wiz-main select')].find(s => [...s.options].some(o => o.value === 'ice40'));
      if (!fam) { next()?.click(); await tick(); }
    }
    fam.value = 'ice40'; fam.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    const sels = [...document.querySelectorAll('.wiz-main select')];
    const part = sels.find(s => [...s.options].some(o => o.value === 'ice40up5k'));
    part.value = 'ice40up5k'; part.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    const pkg = sels.find(s => [...s.options].some(o => o.value === 'sg48'));
    const spd = sels[sels.indexOf(pkg) + 1];
    const seen = { parts: [...part.options].map(o => o.textContent), pkgs: [...pkg.options].map(o => o.textContent), speeds: spd.options.length, speedOff: spd.disabled };
    for (let i = 0; i < 10; i++) {
      const b = [...document.querySelectorAll('button')].find(x => /^(Next >|Seguinte >|Finish|Concluir)/.test(x.textContent.trim()));
      if (!b) break;
      b.click(); await tick();
      if (!q('.wiz-main')) break;
    }
    for (let i = 0; i < 100 && !(await api.projects()).some(p => (p.name || p) === 'ice40dev'); i++) await tick();
    const pj = await api.project('ice40dev');
    return { seen, device: pj.device, constraints: pj.constraints };
  });
  assert.deepEqual(r.seen.parts, ['ICE40LP384', 'ICE40LP1K', 'ICE40LP4K', 'ICE40LP8K', 'ICE40HX1K', 'ICE40HX4K', 'ICE40HX8K', 'ICE40UP3K', 'ICE40UP5K']);
  assert.deepEqual(r.seen.pkgs, ['SG48  (39 I/O)', 'UWG30  (21 I/O)']);
  assert.equal(r.seen.speeds, 0);
  assert.equal(r.seen.speedOff, true);
  assert.deepEqual(r.device, { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' });
  assert.equal(r.constraints, 'constraints/top.pcf');
});
