// The drawing editors' bottom panel resized and moved (#3797, web/js/dock-panel.js): where a drag docks it, the size
// its edge gives, the limits, the place and size kept per editor (a stored value read back, #3797's `right` as `left`
// (#3802), a wrong one or no storage: the default). The panel in the editors: test/ui/dock-panel.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { DEFAULT, MAX, MIN, clamp, dockAt, readDock, sizeAt } = await import('../web/js/dock-panel.js');
beforeEach(() => store.clear());

const R = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };

test('#3802 a dragged title docks the panel on the left when further left than down, else below', () => {
  assert.equal(dockAt(R, 120, 100), 'left');      // top left
  assert.equal(dockAt(R, 120, 600), 'left');      // bottom left corner, further left (0.975) than down (0.917)
  assert.equal(dockAt(R, 300, 640), 'bottom');    // bottom, left of the middle
  assert.equal(dockAt(R, 500, 350), 'bottom');    // the middle
  assert.equal(dockAt(R, 880, 60), 'bottom');     // top right: never right nor above
  assert.equal(dockAt(R, 880, 350), 'bottom');    // the right edge: no right dock any more
  assert.equal(dockAt(R, 440, 100), 'left');      // just left of the middle, near the top
  assert.equal(dockAt({ ...R, width: 0, height: 0 }, 100, 50), 'bottom');   // (no size yet)
});

test('#3797 #3802 the edge gives the part of the drawing area beyond it, between MIN and MAX', () => {
  assert.equal(sizeAt(R, 'bottom', 0, 290), 0.6);
  assert.equal(sizeAt(R, 'left', 420, 0), 0.4);       // on the left: its right edge 320 px from the area's left
  assert.equal(sizeAt(R, 'bottom', 0, 0), MAX);      // above the area
  assert.equal(sizeAt(R, 'bottom', 0, 640), MIN);    // near its bottom
  assert.equal(sizeAt(R, 'left', 0, 0), MIN);        // past its left
  assert.equal(sizeAt(R, 'left', 2000, 0), MAX);     // past its right
  assert.deepEqual([clamp(-1), clamp(0.5), clamp(9)], [MIN, 0.5, MAX]);
});

test('#3797 #3802 the place and size kept per editor kind; a kept right read as left; the default for none, a wrong one, or no storage', () => {
  assert.deepEqual(readDock('fsm'), DEFAULT);
  assert.deepEqual(readDock('fsm', 0.44), { dock: 'bottom', size: 0.44 });
  store.set('silinx.fsm.trypanel', JSON.stringify({ dock: 'left', size: 0.3 }));
  assert.deepEqual(readDock('fsm'), { dock: 'left', size: 0.3 });
  store.set('silinx.fsm.trypanel', JSON.stringify({ dock: 'right', size: 0.35 }));   // kept by #3797's side
  assert.deepEqual(readDock('fsm'), { dock: 'left', size: 0.35 });
  assert.deepEqual(readDock('asm'), DEFAULT);                                   // another editor's own
  store.set('silinx.asm.trypanel', JSON.stringify({ dock: 'top', size: 2 }));   // a dock it has not, a size too large
  assert.deepEqual(readDock('asm'), { dock: 'bottom', size: MAX });
  store.set('silinx.petri.trypanel', '{not json');
  assert.deepEqual(readDock('petri', 0.5), { dock: 'bottom', size: 0.5 });
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); } };
  try { assert.deepEqual(readDock('fsm'), DEFAULT); } finally { globalThis.localStorage = saved; }
});
