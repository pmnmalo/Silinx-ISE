// The drawing editors' bottom panel resized and moved (#3797, web/js/dock-panel.js): where a drag docks it, the size
// its edge gives, the limits, the place and size kept per editor (a stored value read back, a wrong one or no storage:
// the default). The panel in the editors: test/ui/dock-panel.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { DEFAULT, MAX, MIN, clamp, dockAt, readDock, sizeAt } = await import('../web/js/dock-panel.js');
beforeEach(() => store.clear());

const R = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };

test('#3797 a dragged title docks the panel on the right when further right than down, else below', () => {
  assert.equal(dockAt(R, 880, 100), 'right');     // top right
  assert.equal(dockAt(R, 880, 600), 'right');     // bottom right corner, further right (0.975) than down (0.917)
  assert.equal(dockAt(R, 700, 640), 'bottom');    // bottom, right of the middle
  assert.equal(dockAt(R, 500, 350), 'bottom');    // the middle
  assert.equal(dockAt(R, 120, 60), 'bottom');     // top left: never left nor above
  assert.equal(dockAt(R, 560, 100), 'right');     // just right of the middle, near the top
  assert.equal(dockAt({ ...R, width: 0, height: 0 }, 100, 50), 'bottom');   // (no size yet)
});

test('#3797 the edge gives the part of the drawing area beyond it, between MIN and MAX', () => {
  assert.equal(sizeAt(R, 'bottom', 0, 290), 0.6);
  assert.equal(sizeAt(R, 'right', 580, 0), 0.4);
  assert.equal(sizeAt(R, 'bottom', 0, 0), MAX);      // above the area
  assert.equal(sizeAt(R, 'bottom', 0, 640), MIN);    // near its bottom
  assert.equal(sizeAt(R, 'right', 2000, 0), MIN);    // past its right
  assert.deepEqual([clamp(-1), clamp(0.5), clamp(9)], [MIN, 0.5, MAX]);
});

test('#3797 the place and size kept per editor kind; the default for none, a wrong one, or no storage', () => {
  assert.deepEqual(readDock('fsm'), DEFAULT);
  assert.deepEqual(readDock('fsm', 0.44), { dock: 'bottom', size: 0.44 });
  store.set('silinx.fsm.trypanel', JSON.stringify({ dock: 'right', size: 0.3 }));
  assert.deepEqual(readDock('fsm'), { dock: 'right', size: 0.3 });
  assert.deepEqual(readDock('asm'), DEFAULT);                                   // another editor's own
  store.set('silinx.asm.trypanel', JSON.stringify({ dock: 'left', size: 2 }));  // a dock it has not, a size too large
  assert.deepEqual(readDock('asm'), { dock: 'bottom', size: MAX });
  store.set('silinx.petri.trypanel', '{not json');
  assert.deepEqual(readDock('petri', 0.5), { dock: 'bottom', size: 0.5 });
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); } };
  try { assert.deepEqual(readDock('fsm'), DEFAULT); } finally { globalThis.localStorage = saved; }
});
