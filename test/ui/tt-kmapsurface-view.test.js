// UI (#3119, #3120): the 3D Karnaugh map of 3 and 4 inputs seen as it is. On the torus of #3119 (q2 q1 q0 q, by
// columns, solution 7 of 13): every cell that faces the viewer and has room shows its number and value (as the flat map:
// the 0s of an SOP map blank), drawn after its own cell's faces in front, on the surface; what is on the faces seen from
// behind drawn first, and on the torus (closed) not at all: no outline of a hidden cell over the surface in front. On
// the cylinder of #3120 (a b c, by rows): the outline of a.c at the back drawn before the faces in front, seen only
// through the open end.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const T = '.doc:not([hidden]) .tt-editor';
const table = (name, inputs, output, f) => ({ version: 1, name, inputs, outputs: [output], table: { [output]: f }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' });

uiTest('#3119 #3120 Truth Table: the 3D Karnaugh map, the cells\' texts where the cells are seen, the outlines of hidden cells hidden', E, async (page) => {
  // d2 = 1 at 0 2 3 4 5 7 8 11 13 14 15, X at 9; f = 1 at 0 1 2 5 7
  const tor = table('tor', ['q2', 'q1', 'q0', 'q'], 'd2', '101111011X010111');
  const cyl = table('cyl', ['a', 'b', 'c'], 'f', '11100101');
  await makeProject(env, { name: 'TtSurfView', files: { 'src/tor.bool.json': JSON.stringify(tor), 'src/cyl.bool.json': JSON.stringify(cyl) } });
  await page.openProject('TtSurfView');
  const open = async (f) => {
    await page.eval((p) => window.SilinxApp.openTt(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-host'), [f], { what: f });
    await page.click(`${T} .tt-k3d-on`);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-ks`), [T], { what: `${f} in 3D` });
  };
  const solution = async (k) => {
    for (let i = 0; i < 20 && !(await page.eval((t) => document.querySelector(`${t} .tt-sol-n`).textContent, T)).startsWith(`Solution ${k} `); i++) await page.click(`${T} .tt-sol-next`);
    assert.match(await page.eval((t) => document.querySelector(`${t} .tt-sol-n`).textContent, T), new RegExp(`^Solution ${k} of`));
  };
  // what is drawn, in its order
  const look = () => page.eval((t) => {
    const s = document.querySelector(`${t} .tt-ks`);
    s.scrollIntoView({ block: 'center', inline: 'center' });
    const kids = [...s.querySelector('svg').children], shown = (e) => e.style.display !== 'none';
    const drawn = kids.filter((e) => e.tagName !== 'g'), back = (e) => e.classList.contains('back');
    const texts = kids.filter((e) => e.tagName === 'g' && shown(e));
    return {
      // everything on a face seen from behind before everything else
      backFirst: drawn.findLastIndex(back) < drawn.findIndex((e) => !back(e)),
      backShown: drawn.filter((e) => back(e) && !e.classList.contains('tt-ks-face') && shown(e)).map((e) => `${e.classList[0]}:${e.dataset.term}`),
      edges: Object.fromEntries([...new Set(drawn.filter((e) => e.classList.contains('tt-ks-edge')).map((e) => e.dataset.term))].map((k) => {
        const es = drawn.filter((e) => e.classList.contains('tt-ks-edge') && e.dataset.term === k);
        return [k, { front: es.filter((e) => !back(e)).length, back: es.filter(back).length }];
      })),
      texts: Object.fromEntries(texts.map((g) => [g.dataset.row, g.querySelector('.tt-ks-v').textContent])),
      // each text after its cell's faces seen from the front
      over: texts.filter((g) => [...s.querySelectorAll(`.tt-ks-face[data-row="${g.dataset.row}"]:not(.back)`)].some((f) => kids.indexOf(f) > kids.indexOf(g))).map((g) => g.dataset.row),
      // each text's value on the surface (a face of it under its middle)
      off: texts.filter((g) => {
        const r = g.querySelector('.tt-ks-v').getBoundingClientRect(), m = g.querySelector('.tt-ks-m').getBoundingClientRect();
        return [[(r.left + r.right) / 2, (m.top + r.bottom) / 2]].some(([x, y]) => !document.elementsFromPoint(x, y).some((e) => e.classList.contains('tt-ks-face')));
      }).map((g) => g.dataset.row),
    };
  }, T);
  // the torus as first shown
  await open('src/tor.bool.json');
  await solution(7);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-legend`).innerText.replace(/\s+/g, ' ').trim(), T).then((x) => x.replace(/^.*?of 13 ▶ /, '')),
    'q0.q m(3, 7, 11, 15) q1.q m(5, 7, 13, 15) /q1./q0./q m(0, 8) /q2./q1.q0 m(2, 3) /q2.q1./q0 m(4, 5) q2.q1.q0 m(14, 15)');
  let v = await look();
  assert.equal(v.backFirst, true, 'what is on the faces seen from behind drawn first');
  assert.deepEqual(v.backShown, [], 'the torus: nothing on its hidden faces shown');
  // the cells facing the viewer with their texts: the 1s at 0 and 8 in front, 2 on the right, 3 and 11 on the hole's near
  // rim, 7 15 14 at the back; the 0s at 10 blank (as the flat map); 5 and 13, behind the tube in front, and 6, edge-on at
  // the back, none (before: only 2, 7, 10 and 15, and 2 under its own faces)
  assert.deepEqual(v.texts, { 0: '1', 2: '1', 3: '1', 7: '1', 8: '1', 10: '', 11: '1', 14: '1', 15: '1' });
  assert.deepEqual(v.over, [], 'no text under its own cell');
  assert.deepEqual(v.off, [], 'every text on the surface');
  // /q2.q1./q0 m(4, 5) (term 4), under the torus at the back: its outline hidden but where it is seen inside the hole
  assert.ok(v.edges[4].back > 0, 'm(4, 5) mostly on hidden faces');
  // turned to look down on it from higher up (the user's view of #3119)
  await page.eval((t) => {
    const s = document.querySelector(`${t} .tt-ks`);
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) s.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }, T);
  v = await look();
  assert.deepEqual([v.backFirst, v.backShown, v.over, v.off], [true, [], [], []]);
  assert.deepEqual(v.texts, { 2: '1', 3: '1', 6: '', 7: '1', 10: '', 11: '1', 14: '1', 15: '1' });
  // the cylinder (by rows): a.c m(5, 7) round the back; its outline there drawn before the faces in front (they hide it),
  // and only its edge on the left, just in front of the silhouette, after them
  await open('src/cyl.bool.json');
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-kmap-order`); s.value = 'rows'; s.dispatchEvent(new Event('change', { bubbles: true })); }, T);
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-order`)?.value === 'rows' && !!document.querySelector(`${t} .tt-ks`), [T], { what: 'by rows' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-legend`).innerText.replace(/\s+/g, ' ').trim(), T).then((x) => x.replace(/^.*?of 2 ▶ /, '')), '/a./b m(0, 1) /a./c m(0, 2) a.c m(5, 7)');
  v = await look();
  assert.equal(v.backFirst, true);
  assert.ok(v.edges[2].back > v.edges[2].front && v.edges[2].front > 0, JSON.stringify(v.edges[2]));
  // /a./b m(0, 1): 0 in front, 1 round the side at the back (seen inside, through the open top)
  assert.ok(v.edges[0].back > 0 && v.edges[0].front > 0, JSON.stringify(v.edges[0]));
  // the 0s at 4 and 6 blank, as the flat map's
  assert.deepEqual([v.texts, v.over, v.off], [{ 0: '1', 2: '1', 4: '', 6: '' }, [], []]);
  // no warnings
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
