// UI: the Karnaugh map's place in its section (#3059): the minimal solutions' row ("2 minimal solutions exist. ◀ Solution 1
// of 2 ▶") a line of its own, the map under it at the section's left (the options' left), its groups' legend right
// after it (beside it, or just under it when there is no room); with 2 to 6 inputs, one solution (no row) or several,
// SOP and POS, flat and in 3D, on a wide and a narrow screen.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

/** Where the section's parts are: the options, the solutions' row (null when none), the map, the legend. */
const place = (page) => page.eval((t) => {
  const host = document.querySelector(`${t} .tt-kmap-host`), r = (e) => e && e.getBoundingClientRect();
  const map = [...host.children].find((e) => !e.matches('.tt-sol, .tt-legend'));
  const box = (e) => e && { left: Math.round(r(e).left), right: Math.round(r(e).right), top: Math.round(r(e).top), bottom: Math.round(r(e).bottom) };
  return { options: box(document.querySelector(`${t} .tt-groups`)), sol: box(host.querySelector(':scope > .tt-sol')), map: box(map), mapClass: map?.getAttribute('class'), legend: box(host.querySelector(':scope > .tt-legend')) };
}, T);

/** The map under the solutions' row (when there is one), at the section's left; the legend right after it. */
function laidOut(p, what, several) {
  assert.ok(p.map, `${what}: a map`);
  assert.equal(!!p.sol, several, `${what}: the solutions' row ${several ? 'shown' : 'not shown'}`);
  if (p.sol) {
    assert.ok(p.map.top >= p.sol.bottom, `${what}: the map (top ${p.map.top}) under the solutions' row (bottom ${p.sol.bottom})`);
    assert.ok(Math.abs(p.sol.left - p.options.left) <= 1, `${what}: the solutions' row at the section's left`);
  }
  assert.ok(Math.abs(p.map.left - p.options.left) <= 1, `${what}: the map (left ${p.map.left}) at the section's left (${p.options.left})`);
  const beside = p.legend.left >= p.map.right - 1 && p.legend.top < p.map.bottom;
  const under = Math.abs(p.legend.left - p.options.left) <= 1 && p.legend.top >= p.map.bottom - 1 && p.legend.top - p.map.bottom <= 20;
  assert.ok(beside || under, `${what}: the legend right after the map (${JSON.stringify({ map: p.map, legend: p.legend })})`);
}

uiTest('#3059 Karnaugh map: under the minimal solutions\' row, at the section\'s left, the legend right after it', E, async (page) => {
  const tables = {
    k2: { ...newTable('k2', ['a', 'b'], ['f']), table: { f: '0111' } },
    // g = m(0, 7) + d(1, 2, 4, 5, 6): two minimal SOPs; f one
    k3: { ...newTable('k3', ['a', 'b', 'c'], ['f', 'g']), table: { f: '1101X100', g: '1XX0XXX1' } },
    k4: { ...newTable('k4', ['a', 'b', 'c', 'd'], ['f']), table: { f: '1X0X01X1X0110X01' } },
    k5: { ...newTable('k5', ['a', 'b', 'c', 'd', 'e'], ['f']), table: { f: '10X11X0101X0011X10X11X0101X0011X' } },
    k6: { ...newTable('k6', ['a', 'b', 'c', 'd', 'e', 'h'], ['f']), table: { f: Array.from({ length: 64 }, (_, m) => (m % 3 ? '1' : '0')).join('') } },
  };
  const files = Object.fromEntries(Object.entries(tables).map(([k, v]) => [`src/${k}.bool.json`, JSON.stringify(v)]));
  await makeProject(env, { name: 'TtKmapLayout', files });
  await page.openProject('TtKmapLayout');
  const open = async (k) => {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/${k}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-legend'), [`src/${k}.bool.json`], { what: k });
  };
  const several = () => page.eval((t) => !!document.querySelector(`${t} .tt-kmap-host > .tt-sol`), T);
  const tab = async (o) => { await page.eval((t, o) => document.querySelector(`${t} .tt-tab[data-out=${o}]`).click(), T, o); };
  const pos = async (on) => { await page.eval((t, g) => document.querySelector(`${t} .tt-groups input[value=${g}]`).click(), T, on ? 'pos' : 'sop'); };
  const d3 = async () => {
    const on = !await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).checked, T);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);   // (narrow: the box may be under the drawer's edge)
    await page.waitFor((t, on) => !!document.querySelector(`${t} .tt-kmap-host > ${on ? '.tt-k3d' : 'svg.tt-kmap'}`) && !!document.querySelector(`${t} .tt-legend`), [T, on], { what: on ? '3D' : 'flat' });
  };

  for (const [w, h] of [[1400, 900], [760, 1000]]) {
    await page.setViewport(w, h);
    const at = `${w}px`;
    // the reported case: 3 inputs, g with two minimal solutions
    await open('k3');
    await tab('g');
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-kmap-host > .tt-sol`), [T], { what: 'g\'s solutions' });
    laidOut(await place(page), `${at} 3 inputs, two solutions`, true);
    await pos(true); laidOut(await place(page), `${at} 3 inputs, POS`, await several());
    await d3(); const c = await place(page); laidOut(c, `${at} 3 inputs, POS, on a cylinder`, await several());
    assert.match(c.mapClass, /tt-ks-cylinder/, 'the cylinder, not the flat map');
    await d3(); await pos(false);
    await tab('f'); laidOut(await place(page), `${at} 3 inputs, one solution`, false);
    for (const k of ['k2', 'k4', 'k5', 'k6']) {
      await open(k);
      laidOut(await place(page), `${at} ${k}`, await several());
      if (k === 'k2') continue;
      await d3(); laidOut(await place(page), `${at} ${k} in 3D`, await several());
      await d3();   // (the 3D box is shared by every table: left as it was found)
    }
  }
  await page.setViewport(1400, 900);
});
