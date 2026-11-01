// web/js/prefs.js (#1243): the site's development edition (dev/) keeps its settings under keys of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prefKey, DEV_SITE } from '../web/js/prefs.js';
import * as store from '../web/js/project-store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('prefKey: the stable edition and the application keep their keys; the development edition its own', () => {
  assert.equal(DEV_SITE, false);   // (Node: no page)
  for (const k of ['silinx.ui', 'silinx.view.Pj', 'xl.leftW', 'xl.sch.hops']) assert.equal(prefKey(k), k);
  assert.equal(prefKey('silinx.ui', false), 'silinx.ui');
  assert.equal(prefKey('silinx.ui', true), 'silinx.dev.ui');
  assert.equal(prefKey('silinx.view.Pj', true), 'silinx.dev.view.Pj');
  assert.equal(prefKey('xl.sch.hops', true), 'silinx.dev.xl.sch.hops');
  assert.equal(prefKey('silinxui', true), 'silinx.dev.silinxui');   // ('silinx.' only, with its dot)
  // the projects' keys (project-store.js, api-local.js) are not settings: no clash with them
  assert.notEqual(prefKey('silinx.standalone.fs', true), prefKey('silinx.fs', true));
});

test('DEV_SITE: a page under dev/ (the site\'s development edition), not the stable edition\'s root', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    for (const [pathname, dev] of [['/Silinx-ISE/dev/', true], ['/dev/index.html', true], ['/Silinx-ISE/', false], ['/', false], ['/devices/', false]]) {
      Object.defineProperty(globalThis, 'location', { value: { pathname }, configurable: true });
      const m = await import(`../web/js/prefs.js?${encodeURIComponent(pathname)}`);
      assert.equal(m.DEV_SITE, dev, pathname);
      assert.equal(m.prefKey('silinx.ui'), dev ? 'silinx.dev.ui' : 'silinx.ui', pathname);
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'location', saved); else delete globalThis.location;
  }
});

test('project-store.js still exports DEV_SITE (from prefs.js)', () => {
  assert.equal(store.DEV_SITE, DEV_SITE);
});

// a setting written with a literal key would be shared by both editions again
test('every localStorage key of web/js goes through prefKey (the projects\' own keys excepted)', () => {
  const dir = path.join(ROOT, 'web/js');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(([^,)]+)/g)) {
        const arg = m[1].trim();
        // (a constant made by prefKey, checked below; PREF: api-local.js's storage in use, its own dev key)
        if (/^(prefKey|[A-Z_]+_KEY)\(/.test(arg) || /^(KEY|[A-Z_]+_KEY|UPDATE_CACHE|UPDATE_ON_START|PREF|key)$/.test(arg)) continue;
        bad.push(`${f}:${i + 1}: ${arg}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('the constants that name the settings\' keys are made by prefKey', () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, 'web/js', f), 'utf8');
  const defs = {
    'silinx.js': ['UI_KEY', 'THEME_KEY'], 'narrow.js': ['DRAWER_KEY', 'PROPS_KEY', 'SYMBOLS_KEY'], 'i18n.js': ['KEY'], 'diaghelp.js': ['KEY'],
    'ink-dialog.js': ['SAMPLES_KEY'], 'emulator.js': ['HIDDEN_KEY'], 'tasks.js': ['TASKS_KEY'], 'wizards.js': ['UPDATE_CACHE', 'UPDATE_ON_START'],
  };
  for (const [f, names] of Object.entries(defs)) {
    for (const n of names) assert.match(src(f), new RegExp(`const ${n} = prefKey\\('silinx\\.`), `${f} ${n}`);
  }
  // the parameters: the splitters' storageKey (ui.js), the viewers' engine (viewers.js), the narrow panels (narrow.js)
  assert.match(src('ui.js'), /getItem\(prefKey\(storageKey\)\)/);
  assert.match(src('ui.js'), /setItem\(prefKey\(storageKey\),/);
  assert.match(src('viewers.js'), /getItem\(prefKey\(ENGINE_KEY\)\)/);
  assert.match(src('app.js'), /const VIEW_KEY = name => prefKey\(`silinx\.view\.\$\{name\}`\);/);
  assert.match(src('doc-cursor.js'), /const CURSOR_KEY = project => prefKey\(`silinx\.cursor\.\$\{project\}`\);/);   // (#1299)
  // index.html's early script: the interface, the theme and the drawer under the same keys
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  assert.match(html, /var k = \/\\\/dev\\\/\/\.test\(location\.pathname\) \? 'silinx\.dev\.' : 'silinx\.';/);
  for (const k of ['ui', 'theme', 'drawer']) assert.match(html, new RegExp(`localStorage\\.getItem\\(k \\+ '${k}'\\)`));
  assert.doesNotMatch(html, /localStorage\.getItem\('silinx\./);
});

// the modules that read the keys at load time, in Node: the stable edition's keys (no page under dev/)
test('the key constants in Node (no page): the stable keys, unchanged', async () => {
  const { UI_KEY, THEME_KEY } = await import('../web/js/silinx.js');
  assert.deepEqual([UI_KEY, THEME_KEY], ['silinx.ui', 'silinx.theme']);
});
