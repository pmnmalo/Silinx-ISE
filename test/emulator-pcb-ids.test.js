// The boards' drawings each with ids of their own (#2838, web/js/emulator-pcb.js): every layout of
// web/js/emulator-layouts.js drawn twice (as the Board Emulator and I/O Pin Planning's Board view do) on a small
// stand-in for the DOM; the two drawings share no id, each reference (url(#…), href="#…") names an id of its own
// drawing, and a gradient's fill carries a plain fallback colour, its gradient's own. scopeIds alone: its edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { getDeviceDb } from '../server/devices.js';

// a stand-in for the DOM: elements that keep their attributes, children and innerHTML, enough for the layouts
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.dataset = {}; this.style = {}; this.innerHTML = ''; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...c) { this.children.push(...c); }
  appendChild(c) { this.children.push(c); return c; }
  prepend(...c) { this.children.unshift(...c); }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.children.find((c) => c instanceof El) ?? null; }
}
globalThis.document ??= { createElementNS: (_, tag) => new El(tag), createElement: (tag) => new El(tag), createTextNode: (t) => t };
const h = (tag, attrs = {}, ...kids) => { const e = new El(tag); for (const [k, v] of Object.entries(attrs || {})) if (k !== 'style') e.attrs[k] = v; e.append(...kids.flat()); return e; };
const mk = () => h('div', {});
const { BOARD_LAYOUTS } = await import('../web/js/emulator-layouts.js');
const { scopeIds } = await import('../web/js/emulator-pcb.js');
const boards = getDeviceDb({ all: true }).boards;

// a drawn board's SVG markup (the PCB's art: the svg whose class is emu-pcb-art)
function draw(id) {
  const board = boards.find((b) => b.id === id);
  const wrap = BOARD_LAYOUTS[id]({ board, title: 'top', h, mkDigit: mk, mkLed: mk, mkSwitch: mk, mkButton: mk, portLabel: () => '', bitFor: () => null,
    clockNote: '', mkLcd: mk, mkRotary: mk, turnKnob: () => {}, mkPower: () => h('div', {}, mk()) });
  const arts = [];
  const walk = (e) => { if (e instanceof El) { if (e.attrs.class === 'emu-pcb-art') arts.push(e.innerHTML); e.children.forEach(walk); } };
  walk(wrap);
  assert.equal(arts.length, 1, `${id}: one PCB drawing`);
  return arts[0];
}
const ids = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refs = (svg) => [...svg.matchAll(/(?:url\(#|href="#)([^")]+)/g)].map((m) => m[1]);

for (const id of Object.keys(BOARD_LAYOUTS)) {
  test(`#2838 the ${id} drawn twice: no id shared, every reference its own drawing's, the PCB's fill with a fallback colour`, () => {
    const [a, b] = [draw(id), draw(id)];
    assert.ok(ids(a).length > 0, 'the PCB has its gradient');
    assert.deepEqual(ids(a).filter((x) => ids(b).includes(x)), [], 'no id in both drawings');
    for (const svg of [a, b]) {
      assert.equal(new Set(ids(svg)).size, ids(svg).length, 'no id twice in one drawing');
      assert.deepEqual(refs(svg).filter((r) => !ids(svg).includes(r)), [], 'every reference to an id of the same drawing');
      // a gradient's fill: url(#its id) then its top colour, plain
      for (const [, gid, colour] of svg.matchAll(/<linearGradient id="([^"]+)"[^>]*><stop offset="0" stop-color="(#[0-9a-f]+)"/g)) {
        const fills = [...svg.matchAll(/fill="url\(#([^)]+)\)([^"]*)"/g)].filter((m) => m[1] === gid);
        assert.ok(fills.length > 0, `${gid} used`);
        assert.deepEqual(fills.map((m) => m[2].trim()), fills.map(() => colour), `${gid}: the fallback colour`);
      }
    }
  });
}

test('#2838 scopeIds: the ids a drawing defines and their references renamed, the others as they are', () => {
  assert.equal(scopeIds('<rect fill="#fff"/>', 'b1'), '<rect fill="#fff"/>');
  assert.equal(scopeIds('<defs><linearGradient id="g"/><clipPath id="c"/></defs><rect fill="url(#g) #123" clip-path="url(#c)"/><use href="#c"/>', 'b7'),
    '<defs><linearGradient id="g-b7"/><clipPath id="c-b7"/></defs><rect fill="url(#g-b7) #123" clip-path="url(#c-b7)"/><use href="#c-b7"/>');
  // a reference to an id it does not define (the document's), and a data-id, left alone
  assert.equal(scopeIds('<g id="g" data-id="g"><rect fill="url(#other)"/><rect fill="url(#g)"/></g>', 'b2'), '<g id="g-b2" data-id="g"><rect fill="url(#other)"/><rect fill="url(#g-b2)"/></g>');
});
