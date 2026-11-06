// UI: an I/O marker added on a symbol's pin continues the pin outwards (#2926): the pin's outward direction, the
// symbol's rotation and mirror applied (up: above it, turned 270°; down: below it, 90°; left; right), drawn so and
// written so to the document; on empty space as before (an input to the left); the HDL as for markers unturned.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc, symbolPins, normalizeDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

// screen position of a sheet point (through the view transform)
const at = (page, x, y) => page.eval((px, py) => {
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + px * +m[3], y: r.top + +m[2] + py * +m[3] };
}, x, y);
const getDoc = page => page.eval(() => window.Silinx.active.schEditor.getDoc());
const problems = page => page.eval(async () => (await import('/core/schdoc.js')).netlist(window.Silinx.active.schEditor.getDoc()).diagnostics.map((d) => `${d.severity}: ${d.message}`));

uiTest('#2926 schematic: I/O markers added on an upward, a downward, a rightward and a leftward pin face the way the pins point', E, async (page) => {
  const doc = newDoc('ps', 'vhdl');
  // U1 turned 90°: its input points up, its output down; U2 mirrored: its input points right, its output left
  const u1 = { id: 'S1', type: 'inv', x: 200, y: 100, rot: 90, mirror: false, name: 'U1', params: {} };
  const u2 = { id: 'S2', type: 'inv', x: 300, y: 200, rot: 0, mirror: true, name: 'U2', params: {} };
  doc.symbols.push(u1, u2);
  const pins = s => Object.fromEntries(symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {}).map((p) => [p.name, p]));
  const P1 = pins(u1), P2 = pins(u2);
  assert.deepEqual([P1.I.side, P1.O.side, P2.I.side, P2.O.side], ['N', 'S', 'E', 'W']);
  await makeProject(env, { name: 'PinSidePj', files: { 'src/ps.sch.json': JSON.stringify(doc) } });
  await page.openProject('PinSidePj');
  await page.eval(() => window.SilinxApp.openSch('src/ps.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  await page.click(`${ED} .se-btn[data-act=io]`);
  const add = async (pt, name) => {
    const n = (await getDoc(page)).ports.length;
    await page.click(await at(page, pt.x, pt.y));
    await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: `${name}: port name prompt focused` });
    await page.eval((v) => { const i = document.querySelector('.se-prompt input'); i.value = v; i.dispatchEvent(new Event('input')); }, name);
    await page.key('Enter');
    await page.waitFor((k) => window.Silinx.active.schEditor.getDoc().ports.length === k, [n + 1], { what: `${name} placed` });
  };
  await add(P1.I, 'a'); await add(P1.O, 'y'); await add(P2.I, 'b'); await add(P2.O, 'z');
  // on empty space: as before, no side stored (an input, the last marker's direction being an output's: z)
  await add({ x: 330, y: 120 }, 'free');
  const d = await getDoc(page);
  assert.deepEqual(d.ports.map((p) => [p.name, p.dir, p.side ?? null]),
    [['a', 'in', 'N'], ['y', 'out', 'S'], ['b', 'in', 'E'], ['z', 'out', 'W'], ['free', 'out', null]]);
  // drawn so: each marker's box beyond its pin, on the side the pin points
  const boxes = await page.eval((ed) => Object.fromEntries([...document.querySelectorAll(`${ed} svg .port`)].map((g) => {
    const r = g.querySelector('.hitbox');
    return [g.dataset.id, ['x', 'y', 'width', 'height'].map((k) => +r.getAttribute(k))];
  })), ED);
  const id = n => d.ports.find((p) => p.name === n).id;
  const [ax, ay, aw, ah] = boxes[id('a')];
  assert.ok(ay + ah === P1.I.y && ax < P1.I.x && ax + aw > P1.I.x, `a above its pin: ${boxes[id('a')]}`);
  const [, yy] = boxes[id('y')];
  assert.equal(yy, P1.O.y, 'y below its pin');
  const [bx] = boxes[id('b')];
  assert.equal(bx, P2.I.x, 'b to the right of its pin');
  const [zx, , zw] = boxes[id('z')];
  assert.equal(zx + zw, P2.O.x, 'z to the left of its pin');
  await page.key('Escape');
  // the HDL: the four ports, each inverter between two of them, as for markers unturned; free unconnected (its warning)
  assert.deepEqual(await problems(page), ["warning: I/O marker 'free' is not connected"]);
  await page.waitFor(async () => /z <= not b;/.test(await (await fetch('/api/projects/PinSidePj/file?path=src%2Fps.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
  const vhd = await readWs(env, 'PinSidePj', 'src/ps.vhd');
  assert.match(vhd, /y <= not a;/);
  assert.match(vhd, /a : in std_logic;\s*y : out std_logic;\s*b : in std_logic;\s*z : out std_logic;\s*free : out std_logic/);
  // one Undo: the last marker only
  await page.eval(() => window.Silinx.active.schEditor.undo());
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.length === 4, [], { what: 'undone' });
});
