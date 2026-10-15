// web/js/narrow.js (#266): the narrow screens' drawer and the editors' panel buttons, with a minimal
// stand-in for the page (no browser): the state kept per viewer, no storage, the wide screens left
// alone; the breakpoint is the same in the stylesheets and the page's first-paint script.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = await import('../web/js/narrow.js');

// a page element: attributes, classes, click listeners
function el() {
  const attrs = {}, cls = new Set(), on = [];
  return {
    attrs, on,
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null,
    classList: { add: (c) => cls.add(c), contains: (c) => cls.has(c), toggle: (c, f) => { const v = f ?? !cls.has(c); if (v) cls.add(c); else cls.delete(c); return v; } },
    addEventListener: (ev, fn) => on.push([ev, fn]),
    click() { for (const [ev, fn] of on) if (ev === 'click') fn(); },
  };
}
let page, store, narrow;
function setup({ storage = true, ui = 'modern' } = {}) {
  store = {};
  const ids = { 'drawer-btn': el(), 'drawer-scrim': el() };
  page = { ids, html: { dataset: { ui } } };
  globalThis.document = { documentElement: page.html, getElementById: (id) => ids[id] || null };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (!storage) throw new Error('SecurityError: storage disabled');
      return { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    },
  });
  globalThis.matchMedia = (q) => ({ matches: q === N.NARROW_QUERY && narrow });
}
beforeEach(() => { narrow = true; setup(); });

test('the drawer: open the first time, as the viewer left it after, the header button and the scrim', () => {
  N.initDrawer();
  assert.equal(page.html.dataset.drawer, 'open');
  assert.equal(page.ids['drawer-btn'].attrs['aria-expanded'], 'true');
  assert.deepEqual(store, {});                       // nothing kept until the viewer acts
  page.ids['drawer-btn'].click();
  assert.equal(page.html.dataset.drawer, 'closed');
  assert.equal(page.ids['drawer-btn'].attrs['aria-expanded'], 'false');
  assert.equal(store[N.DRAWER_KEY], 'closed');
  page.ids['drawer-btn'].click();
  assert.equal(store[N.DRAWER_KEY], 'open');
  page.ids['drawer-scrim'].click();
  assert.equal(page.html.dataset.drawer, 'closed');
  // a new page: as it was left
  setup();
  store[N.DRAWER_KEY] = 'closed';
  N.initDrawer();
  assert.equal(page.html.dataset.drawer, 'closed');
  // an unknown value: the default
  setup();
  store[N.DRAWER_KEY] = 'half';
  N.initDrawer();
  assert.equal(page.html.dataset.drawer, 'open');
});

test('the drawer gives way to a document on a narrow screen only', () => {
  N.setDrawer(true);
  narrow = false;
  N.drawerGiveWay();
  assert.equal(page.html.dataset.drawer, 'open');
  narrow = true;
  N.drawerGiveWay();
  assert.equal(page.html.dataset.drawer, 'closed');
  assert.equal(store[N.DRAWER_KEY], 'closed');
  N.drawerGiveWay();                                 // closed: nothing to do
  assert.equal(page.html.dataset.drawer, 'closed');
});

test('the left side\'s tabs: open the drawer; in the modern interface the shown page\'s tab closes it', () => {
  N.setDrawer(false);
  N.leftTabClicked('files', 'design');
  assert.equal(page.html.dataset.drawer, 'open');
  N.leftTabClicked('design', 'files');               // another page: stays open
  assert.equal(page.html.dataset.drawer, 'open');
  N.leftTabClicked('design', 'design');
  assert.equal(page.html.dataset.drawer, 'closed');
  N.leftTabClicked('design', 'design');              // closed: the shown page's tab opens it again
  assert.equal(page.html.dataset.drawer, 'open');
  // the classic interface: its tabs are in the drawer, a click there never closes it
  page.html.dataset.ui = 'classic';
  N.leftTabClicked('design', 'design');
  assert.equal(page.html.dataset.drawer, 'open');
  // a wide screen: nothing changes
  narrow = false;
  N.setDrawer(false, { remember: false });
  N.leftTabClicked('files', 'design');
  assert.equal(page.html.dataset.drawer, 'closed');
});

test('an editor\'s panel button: hidden the first time, toggles its class on the editor, kept per viewer', () => {
  const root = el(), b = el();
  assert.equal(N.panelToggle(root, b, { key: N.PROPS_KEY }), b);
  assert.ok(b.classList.contains('narrow-only'));
  assert.ok(!root.classList.contains('side-open'));
  assert.equal(b.attrs['aria-pressed'], 'false');
  assert.deepEqual(store, {});
  b.click();
  assert.ok(root.classList.contains('side-open') && b.classList.contains('on'));
  assert.equal(b.attrs['aria-pressed'], 'true');
  assert.equal(store[N.PROPS_KEY], 'open');
  // another editor opened later: its panel as it was left; its own class and key
  const root2 = el(), b2 = el(), sym = el();
  N.panelToggle(root2, b2, { key: N.PROPS_KEY });
  N.panelToggle(root2, sym, { cls: 'pal-open', key: N.SYMBOLS_KEY });
  assert.ok(root2.classList.contains('side-open') && !root2.classList.contains('pal-open'));
  sym.click();
  assert.ok(root2.classList.contains('pal-open'));
  b2.click();
  assert.ok(!root2.classList.contains('side-open') && root2.classList.contains('pal-open'));
  assert.deepEqual(store, { [N.PROPS_KEY]: 'closed', [N.SYMBOLS_KEY]: 'open' });
});

test('no storage (private window, blocked site data): everything works, nothing kept', () => {
  setup({ storage: false });
  N.initDrawer();
  assert.equal(page.html.dataset.drawer, 'open');
  page.ids['drawer-btn'].click();
  assert.equal(page.html.dataset.drawer, 'closed');
  const root = el(), b = el();
  N.panelToggle(root, b, { key: N.PROPS_KEY });
  b.click();
  assert.ok(root.classList.contains('side-open'));
});

test('no matchMedia: a wide screen', () => {
  delete globalThis.matchMedia;
  assert.equal(N.isNarrow(), false);
  N.setDrawer(true, { remember: false });
  N.drawerGiveWay();
  assert.equal(page.html.dataset.drawer, 'open');
});

test('the breakpoint (1024 px) is the same in the stylesheets and the first-paint script keeps the drawer under the same key', () => {
  assert.equal(N.NARROW_QUERY, '(max-width: 1024px)');
  for (const f of ['app.css', 'modern.css', 'asm-editor.css', 'sch-editor.css']) {
    const css = fs.readFileSync(path.join(ROOT, 'web/css', f), 'utf8');
    assert.ok(css.includes('@media (max-width: 1024px)'), f);
  }
  assert.ok(fs.readFileSync(path.join(ROOT, 'web/css/app.css'), 'utf8').includes('@media (min-width: 1025px) { .narrow-only { display: none !important; } }'));
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  assert.ok(html.includes(`localStorage.getItem('${N.DRAWER_KEY}') === 'closed'`));
  assert.match(html, /<button id="drawer-btn"[^>]*aria-controls="left"/);
  assert.match(html, /<div id="drawer-scrim"><\/div>/);
});
