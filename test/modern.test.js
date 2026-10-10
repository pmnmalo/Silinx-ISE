// web/js/modern.js: the interface and theme preferences, and the matching of the command palette;
// web/index.html + web/css/modern.css: the two interfaces share one page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, configurable: true, writable: true });
let systemDark = false;
globalThis.matchMedia = () => ({ get matches() { return systemDark; }, addEventListener() {} });
globalThis.addEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
globalThis.Event ??= class { constructor(type) { this.type = type; } };
const M = await import('../web/js/modern.js');
const fakeRoot = () => ({ dataset: {}, style: {} });

test('preferences: the modern interface following the system theme by default; invalid values ignored', () => {
  mem.clear();
  assert.equal(M.getInterface(), 'modern');
  assert.equal(M.getTheme(), 'system');
  mem.set(M.UI_KEY, 'classic'); mem.set(M.THEME_KEY, 'dark');
  assert.equal(M.getInterface(), 'classic');
  assert.equal(M.getTheme(), 'dark');
  mem.set(M.UI_KEY, 'retro'); mem.set(M.THEME_KEY, 'purple');
  assert.equal(M.getInterface(), 'modern');
  assert.equal(M.getTheme(), 'system');
  assert.equal(M.readPref('x', ['a', 'b'], 'b'), 'b');
});

test('effectiveTheme: system follows the OS, light and dark are fixed', () => {
  assert.equal(M.effectiveTheme('system', true), 'dark');
  assert.equal(M.effectiveTheme('system', false), 'light');
  assert.equal(M.effectiveTheme('light', true), 'light');
  assert.equal(M.effectiveTheme('dark', false), 'dark');
});

test('applyPrefs puts data-ui and data-theme on the root; the classic look is always light', () => {
  mem.clear();
  const r = fakeRoot();
  systemDark = true;
  assert.deepEqual(M.applyPrefs(r), { ui: 'modern', theme: 'system', shown: 'dark' });
  assert.equal(r.dataset.ui, 'modern'); assert.equal(r.dataset.theme, 'dark'); assert.equal(r.style.colorScheme, 'dark');
  systemDark = false;
  M.applyPrefs(r);
  assert.equal(r.dataset.theme, 'light');
  mem.set(M.THEME_KEY, 'dark');
  M.applyPrefs(r);
  assert.equal(r.dataset.theme, 'dark');
  mem.set(M.UI_KEY, 'classic');
  M.applyPrefs(r);
  assert.equal(r.dataset.ui, 'classic');
  assert.equal(r.dataset.theme, 'light', 'the ISE look has no dark theme');
});

test('setInterface / setTheme store valid values and notify the listeners', () => {
  mem.clear();
  globalThis.document = { documentElement: fakeRoot() };
  const seen = [];
  const off = M.onPrefsChange((p) => seen.push(p));
  M.setInterface('classic');
  M.setTheme('dark');
  M.setTheme('neon');            // ignored
  M.setInterface('retro');       // ignored
  off();
  M.setTheme('light');           // no longer heard
  assert.equal(mem.get(M.UI_KEY), 'classic');
  assert.equal(mem.get(M.THEME_KEY), 'light');
  assert.deepEqual(seen.map((p) => [p.ui, p.theme]), [['classic', 'system'], ['classic', 'dark']]);
  M.setInterface('modern'); M.setTheme('dark');
  M.toggleTheme();
  assert.equal(mem.get(M.THEME_KEY), 'light');
  M.toggleTheme();
  assert.equal(mem.get(M.THEME_KEY), 'dark');
  delete globalThis.document;
});

test('fuzzyScore: substrings first (word starts best), then letters that follow each other or start words', () => {
  const s = M.fuzzyScore;
  assert.equal(s('', 'anything'), 0);
  assert.ok(s('sim', 'View Simulation') > 1000, 'substring at a word start');
  assert.ok(s('sim', 'View Simulation') > s('ula', 'View Simulation'), 'word start beats the middle of a word');
  assert.ok(s('SIM', 'view simulation') > 1000, 'case-insensitive');
  assert.ok(s('nsou', 'Project New Source…') > 0, 'n(ew) sou(rce)');
  assert.ok(s('st', 'Set as Top Module') > 0, 's(et) t(op)');
  assert.equal(s('sim', 'Process Implement Top Module'), null, 'scattered letters do not match');
  assert.equal(s('xyz', 'View Theme Dark'), null);
  assert.ok(s('new sou', 'Project New Source…') > 1000, 'a substring with its space');
  assert.ok(s('newsou', 'Project New Source…') > 0, 'n-e-w s-o-u without the space');
  assert.ok(s('main', 'src/main.vhd') > s('main', 'src/domain_main.vhd'), 'earlier match, shorter text');
});

test('rankEntries: best first, ties in their order, English text also matches, limit', () => {
  const es = [
    { text: 'Ver Simulação', en: 'View Simulation' },
    { text: 'Processo Simular Modelo Comportamental', en: 'Process Simulate Behavioral Model' },
    { text: 'Ajuda Acerca do Silinx ISE', en: 'Help About Silinx ISE' },
    { text: 'src/sim_top.vhd' },
  ];
  assert.deepEqual(M.rankEntries(es, ''), es, 'empty query: everything, in order');
  assert.deepEqual(M.rankEntries(es, '   ', 2), es.slice(0, 2));
  const r = M.rankEntries(es, 'simul');
  assert.deepEqual(r.map((e) => e.en || e.text), ['View Simulation', 'Process Simulate Behavioral Model']);
  assert.deepEqual(M.rankEntries(es, 'about').map((e) => e.en), ['Help About Silinx ISE'], 'English text in the Portuguese interface');
  assert.deepEqual(M.rankEntries(es, 'acerca').map((e) => e.en), ['Help About Silinx ISE'], 'translated text');
  assert.deepEqual(M.rankEntries(es, 'sim_top').map((e) => e.text), ['src/sim_top.vhd']);
  assert.deepEqual(M.rankEntries(es, 'zzz'), []);
});

test('menuCommands: enabled items with an action, submenus as paths, separators and empties skipped', () => {
  let called = '';
  const menus = [
    { label: 'File', items: () => [
      { label: 'New Project…', action: () => { called = 'new'; }, shortcut: 'Ctrl+N' },
      '-', null,
      { label: 'Close Project', action: () => {}, disabled: () => true },
      { label: 'Recent Projects', submenu: [{ label: 'blinky', action: () => { called = 'blinky'; } }] },
    ] },
    { label: 'View', items: [
      { label: 'Theme', submenu: [{ label: 'Dark', checked: true, action: () => {} }, { label: 'Light', action: () => {}, disabled: true }] },
      { label: 'No action here' },
    ] },
  ];
  const cmds = M.menuCommands(menus);
  assert.deepEqual(cmds.map((c) => c.path), ['File › New Project…', 'File › Recent Projects › blinky', 'View › Theme › Dark']);
  assert.deepEqual(cmds[1].group, ['File', 'Recent Projects']);
  assert.equal(cmds[0].shortcut, 'Ctrl+N');
  assert.equal(cmds[2].checked, true);
  cmds[1].action();
  assert.equal(called, 'blinky');
  assert.deepEqual(M.menuCommands(null), []);
});

test('index.html: one page for both interfaces (header, activity bar icons, empty state, early theme script)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  for (const id of ['topbar', 'titlebar', 'menubar', 'toolbar', 'title-project', 'palette-btn', 'theme-btn', 'ws-empty', 'left-tabs', 'doc-tabs', 'console-wrap', 'statusbar'])
    assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<link rel="stylesheet" href="\/css\/modern.css">/);
  // the interface and theme are set before the first paint (no flash of the other look)
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /localStorage\.getItem\('silinx\.ui'\)/);
  assert.match(head, /prefers-color-scheme: dark/);
  for (const page of ['start', 'design', 'files', 'libraries']) assert.match(html, new RegExp(`data-page="${page}" role="tab"`), page);
  assert.equal((html.match(/class="ico-inline tab-ico" data-icon="m\w+"/g) || []).length, 4);
});

test('modern.css: the modern look applies only under data-ui="modern"; the classic look hides its parts', () => {
  const css = fs.readFileSync(path.join(ROOT, 'web/css/modern.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // shared parts (both interfaces): the palette, the empty state, the header wrapper, the m-* controls, kbd keys
  const shared = /^(\.pal\b|\.pal-|#ws-empty|#topbar$|\.m-|\.ws-|#app kbd$|html:not\(\[data-ui="modern"\]\)|html\[data-theme="dark"\] \.m-sun$|html:not\(\[data-theme="dark"\]\) \.m-moon$)/;
  // the selectors of a rule, split at the commas outside parentheses (:is(a, b))
  const parts = (sel) => { const out = []; let depth = 0, cur = ''; for (const c of sel) { if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; continue; } depth += c === '(' ? 1 : c === ')' ? -1 : 0; cur += c; } out.push(cur.trim()); return out; };
  const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@][^{}]*)\{/g)].map((m) => m[2].trim()).filter((x) => x && !x.startsWith('@'));
  const loose = selectors.filter((sel) => !parts(sel).every((p) => p.startsWith('html[data-ui="modern"]') || shared.test(p)));
  assert.deepEqual(loose, []);
  // every theme token has a dark value
  const light = css.slice(css.indexOf('html[data-ui="modern"] {'), css.indexOf('}', css.indexOf('html[data-ui="modern"] {')));
  const dark = css.slice(css.indexOf('html[data-ui="modern"][data-theme="dark"] {'));
  const tokens = [...light.matchAll(/(--m-[\w-]+):/g)].map((m) => m[1]).filter((t) => t !== '--m-radius');
  for (const t of tokens) assert.ok(dark.slice(0, dark.indexOf('}')).includes(`${t}:`), `${t} has a dark value`);
  assert.match(css, /html:not\(\[data-ui="modern"\]\) #top-actions/);
});

test('the Keyboard Shortcuts dialog lists the command palette', () => {
  const src = fs.readFileSync(path.join(ROOT, 'web/js/wizards.js'), 'utf8');
  assert.match(src, /\['Ctrl\/Cmd\+K', 'Command palette: search commands and files'\]/);
});
