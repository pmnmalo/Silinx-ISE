// web/js/emulator.js board drawings: every board resource a layout wires a widget to (LEDs,
// switches, buttons, displays, LCD, rotary knob…) exists on that board in the device database,
// with enough pins for the widgets drawn; and the core wiring finds them for a design using them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './ui/core-hooks.js';
import { getDeviceDb } from '../server/devices.js';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js', 'emulator.js'), 'utf8');
const boards = getDeviceDb({ all: true }).boards;

// the layout functions and the boards they draw
const LAYOUTS = Object.fromEntries([...(/const BOARD_LAYOUTS = \{([^}]*)\}/.exec(SRC)?.[1] || '').matchAll(/'?([\w-]+)'?\s*:\s*(\w+)/g)].map((m) => [m[1], m[2]]));

function layoutBody(fn) {
  const start = SRC.indexOf(`function ${fn}(`);
  assert.ok(start >= 0, `layout function ${fn}`);
  const next = SRC.indexOf('\nfunction ', start + 10);
  const nextConst = SRC.indexOf('\nconst ', start + 10);
  return SRC.slice(start, Math.min(...[next, nextConst].filter((i) => i > 0)));
}

/** Board resources a layout uses: { name -> highest pin index used (or 0) }. */
function resourcesUsed(body) {
  const used = new Map();
  const use = (name, idx = 0) => used.set(name, Math.max(used.get(name) ?? -1, idx));
  // loops "for (let i = 0; i < N; i++) { const k = M - i …": widgets k = 0..M
  const loops = [...body.matchAll(/for \(let i = 0; i < (\d+); i\+\+\) \{\s*const k = (\d+) - i[^]*?\n {2}\}/g)];
  const inLoops = [];
  for (const [whole, , m] of loops) {
    const max = +m;
    inLoops.push(whole);
    if (/mkLed\(k/.test(whole)) use('led', max);
    if (/mkDigit\(k/.test(whole)) { use('an', max); use('seg', 6); }
    for (const sw of whole.matchAll(/mkSwitch\(k(?:, '[^']*'(?:, '([\w-]+)')?)?\)/g)) use(sw[1] || 'sw', max);
    for (const b of whole.matchAll(/mkButton\(k(?:, '[^']*'(?:, '([\w-]+)')?)?\)/g)) use(b[1] || 'btn', max);
    for (const p of whole.matchAll(/port\('([\w-]+)', k/g)) use(p[1], max);
  }
  let rest = body;
  for (const l of inLoops) rest = rest.replace(l, '');
  for (const b of rest.matchAll(/mkButton\(0, '[^']*', '([\w-]+)'\)/g)) use(b[1]);
  if (/mkLcd\(/.test(rest)) { use('lcd_e'); use('lcd_rs'); use('lcd_rw'); }
  if (/mkRotary\(/.test(rest)) { use('rot_a'); use('rot_b'); }
  return { used, optional: new Set([...rest.matchAll(/\['(btn_\w+)', '[A-Z]+'/g)].map((m) => m[1])) };
}

test('every board drawn by the emulator is in the device database', () => {
  assert.ok(Object.keys(LAYOUTS).length >= 3, JSON.stringify(LAYOUTS));
  for (const id of Object.keys(LAYOUTS)) assert.ok(boards.some((b) => b.id === id), `board '${id}'`);
});

for (const [id, fn] of Object.entries(LAYOUTS)) {
  test(`${id} layout (${fn}): the resources it wires widgets to exist on the board with enough pins`, () => {
    const board = boards.find((b) => b.id === id);
    const { used, optional } = resourcesUsed(layoutBody(fn));
    assert.ok(used.size >= 3, `${fn} uses resources: ${[...used.keys()]}`);
    for (const [name, maxIdx] of used) {
      const r = board.resources.find((x) => x.name === name);
      if (!r && optional.has(name)) continue;          // drawn only when the board has it
      assert.ok(r, `${id}: resource '${name}' used by the drawing`);
      assert.ok(r.pins.length > maxIdx, `${id}: '${name}' has ${r.pins.length} pin(s), the drawing uses index ${maxIdx}`);
    }
    // direction buttons (drawn when the board has them): mkButton(0, …, res) for each
    if (optional.size) assert.match(layoutBody(fn), /for \(const \[res, lbl, x, y\] of dirs\)[^]*mkButton\(0, '[^']*', res\)/);
    // and conversely the board's LEDs / switches / buttons / digits all have a widget
    for (const name of ['led', 'sw', 'btn', 'an']) {
      const r = board.resources.find((x) => x.name === name);
      if (r) assert.equal((used.get(name) ?? -1) + 1, r.pins.length, `${id}: every ${name} pin is drawn`);
    }
  });
}

test('core wiring: a design with ports named after the board resources is connected through its UCF', async () => {
  const { boardWiring } = await import('../core/emulate.js');
  const { boardAutoAssign } = await import('../core/ucf.js');
  for (const id of Object.keys(LAYOUTS)) {
    const board = boards.find((b) => b.id === id);
    const names = ['led', 'sw', 'btn', 'an', 'seg'].filter((n) => board.resources.some((r) => r.name === n));
    const ports = names.map((n) => {
      const r = board.resources.find((x) => x.name === n);
      const w = r.pins.length;
      return { name: n, dir: n === 'sw' || n === 'btn' ? 'in' : 'out', width: w, msb: w > 1 ? w - 1 : null, lsb: w > 1 ? 0 : null };
    });
    const { assignments, unmatched } = boardAutoAssign(ports, board);
    assert.deepEqual(unmatched, [], `${id}: every port matched`);
    // boardWiring takes the elaborated ports: { name, dir, sig: { t: { w, left, right } } }
    const eports = ports.map((p) => ({ name: p.name, dir: p.dir, sig: { t: { w: p.width, left: p.msb ?? undefined, right: p.lsb ?? undefined, desc: true } } }));
    const wiring = boardWiring({ ports: eports, assignments, board });
    const bits = ports.reduce((n, p) => n + p.width, 0);
    assert.equal(wiring.bits.length, bits, `${id}: all ${bits} port bits on board resources`);
    assert.deepEqual(wiring.unmapped, []);
  }
});
