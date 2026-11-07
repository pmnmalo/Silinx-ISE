// UI: the Karnaugh map's place in its section (#3059): the map at the section's left (the options' left), its groups'
// legend right after it (beside it, centred on its cells, #3064, or just under it when there is no room), the minimal
// solutions' row ("2 minimal solutions exist. ◀ Solution 1 of 2 ▶") a line of its own under them (#3067); with 2 to 6
// inputs, one solution (no row) or several, SOP and POS, flat and in 3D, on a wide and a narrow screen. Its options:
// SOP / POS groups, then Order and 3D (Reset view) on a line of their own at the same left (#3063).
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
  // the map's cells: the flat map's frames (its labels left out), the 3D scene whole
  const frames = map?.matches('svg') ? [...map.querySelectorAll('.tt-k-frame')].map(r) : map ? [r(map)] : [];
  const cells = frames.length ? { top: Math.min(...frames.map((f) => f.top)), bottom: Math.max(...frames.map((f) => f.bottom)) } : null;
  return { cells, options: box(document.querySelector(`${t} .tt-groups`)), sol: box(host.querySelector(':scope > .tt-sol')), map: box(map), mapClass: map?.getAttribute('class'), legend: box(host.querySelector(':scope > .tt-legend')) };
}, T);

/** The map at the section's left, the legend right after it; the solutions' row (when there is one) under both (#3067). */
function laidOut(p, what, several) {
  assert.ok(p.map, `${what}: a map`);
  assert.equal(!!p.sol, several, `${what}: the solutions' row ${several ? 'shown' : 'not shown'}`);
  if (p.sol) {
    assert.ok(p.sol.top >= Math.max(p.map.bottom, p.legend.bottom), `${what}: the solutions' row (top ${p.sol.top}) under the map (bottom ${p.map.bottom}) and its legend (${p.legend.bottom})`);
    assert.ok(p.map.top - p.options.bottom <= 20, `${what}: the map right under the options`);
    assert.ok(Math.abs(p.sol.left - p.options.left) <= 1, `${what}: the solutions' row at the section's left`);
  }
  assert.ok(Math.abs(p.map.left - p.options.left) <= 1, `${what}: the map (left ${p.map.left}) at the section's left (${p.options.left})`);
  const beside = p.legend.left >= p.map.right - 1 && p.legend.top < p.map.bottom;
  const under = Math.abs(p.legend.left - p.options.left) <= 1 && p.legend.top >= p.map.bottom - 1 && p.legend.top - p.map.bottom <= 30;
  assert.ok(beside || under, `${what}: the legend right after the map (${JSON.stringify({ map: p.map, legend: p.legend })})`);
  // beside it, centred on its cells (#3064), unless taller than the map
  const mid = (b) => (b.top + b.bottom) / 2;
  if (beside && p.legend.bottom - p.legend.top < p.cells.bottom - p.cells.top) assert.ok(Math.abs(mid(p.legend) - mid(p.cells)) <= 2, `${what}: the legend (middle ${mid(p.legend)}) centred on the map's cells (${mid(p.cells)})`);
}

uiTest('#3059 #3067 Karnaugh map: at the section\'s left, the legend right after it, the minimal solutions\' row under them', E, async (page) => {
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

/** The options' lines: each a list of [left, top, bottom] of its parts, SOP / POS first, then Order and 3D. */
const optionLines = (page) => page.eval((t) => {
  const parts = [...document.querySelector(`${t} .tt-groups`).children].filter((e) => !e.matches('.tt-groups-br')).map((e) => {
    const r = e.getBoundingClientRect();
    return { what: e.querySelector('input[type=radio]')?.value ?? (e.querySelector('.tt-kmap-order') || e.matches('.tt-kmap-order') ? 'order' : e.querySelector('.tt-k3d-on') ? '3d' : e.matches('.tt-k3d-reset') ? 'reset' : e.tagName), left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  const lines = [];
  for (const p of parts) { const l = lines.find((x) => p.top < x.bottom && p.bottom > x.top); if (l) { l.what.push(p.what); l.bottom = Math.max(l.bottom, p.bottom); } else lines.push({ what: [p.what], left: p.left, top: p.top, bottom: p.bottom }); }
  return lines;
}, T);

uiTest('#3063 Karnaugh map: Order and 3D on a line of their own, under SOP / POS groups, at the same left', E, async (page) => {
  const tables = {
    k1: newTable('k1', ['a'], ['f']),
    k2: { ...newTable('k2', ['a', 'b'], ['f']), table: { f: '0111' } },
    k3: { ...newTable('k3', ['a', 'b', 'c'], ['f']), table: { f: '1XX0XXX1' } },
    k6: { ...newTable('k6', ['a', 'b', 'c', 'd', 'e', 'h'], ['f']), table: { f: Array.from({ length: 64 }, (_, m) => (m % 3 ? '1' : '0')).join('') } },
  };
  await makeProject(env, { name: 'TtKmapOptions', files: Object.fromEntries(Object.entries(tables).map(([k, v]) => [`src/${k}.bool.json`, JSON.stringify(v)])) });
  await page.openProject('TtKmapOptions');
  const open = async (k) => {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/${k}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-groups label'), [`src/${k}.bool.json`], { what: k });
  };
  // (wide: SOP / POS on one line, the rest on the next; narrow: SOP / POS may wrap, Order still starts a line of its own)
  const two = (l, rest, what, wide) => {
    const i = l.findIndex((x) => x.what[0] === 'order');
    assert.deepEqual([l.slice(0, i).flatMap((x) => x.what), l.slice(i).flatMap((x) => x.what)], [['sop', 'pos'], rest], `${what}: SOP / POS, then ${rest.join(', ')} below`);
    if (wide) assert.equal(l.length, 2, `${what}: two lines`);
    assert.ok(l[i].top >= l[i - 1].bottom, `${what}: Order's line under SOP / POS`);
    assert.ok(Math.abs(l[i].left - l[0].left) <= 1, `${what}: Order at the left of SOP`);
  };
  for (const [w, h] of [[1400, 900], [760, 1000]]) {
    await page.setViewport(w, h);
    await open('k1');
    assert.deepEqual((await optionLines(page)).flatMap((x) => x.what), ['sop', 'pos'], `${w}px 1 input: no Order nor 3D`);
    await open('k2'); two(await optionLines(page), ['order'], `${w}px 2 inputs`, w > 1000);
    await open('k3'); two(await optionLines(page), ['order', '3d'], `${w}px 3 inputs`, w > 1000);
    await open('k6'); two(await optionLines(page), ['order', '3d'], `${w}px 6 inputs`, w > 1000);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d-reset`), [T], { what: 'Reset view' });
    two(await optionLines(page), ['order', '3d', 'reset'], `${w}px 6 inputs in 3D`, w > 1000);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);   // (the 3D box is shared by every table)
  }
  await page.setViewport(1400, 900);
});
