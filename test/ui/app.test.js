// UI: application shell — boot, menus and their items, dialogs (Escape / Enter on the topmost
// one only), About, Check for Updates, language switch, keyboard shortcuts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('the app loads without console errors and shows the Start page', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  const s = await page.eval(() => ({
    title: document.title,
    menus: [...document.querySelectorAll('#menubar .item')].map((e) => e.textContent),
    toolbar: document.querySelectorAll('#toolbar .tb-btn').length,
    start: document.getElementById('start-page').innerText,
    console: document.getElementById('console-log').innerText,
  }));
  assert.match(s.title, /Silinx ISE/);
  assert.deepEqual(s.menus, ['File', 'Edit', 'View', 'Project', 'Process', 'Tools', 'Window', 'Help']);
  assert.ok(s.toolbar >= 15, 'toolbar buttons');
  assert.match(s.start, /New Project/);
  assert.match(s.start, /No projects yet/);
  assert.match(s.console, /Project Navigator/);
  assert.doesNotMatch(s.console, /ERROR/);
  // every toolbar icon is drawn
  assert.equal(await page.eval(() => [...document.querySelectorAll('#toolbar .tb-btn')].filter((b) => !b.querySelector('svg')).length), 0);
});

// state of the UI used to tell whether a menu item did something
const SIGNATURE = `window.__sig = () => JSON.stringify({
  dlg: document.querySelectorAll('.dlg-overlay').length,
  cm: document.querySelectorAll('.CodeMirror-dialog').length,
  docs: window.Silinx.docs.map((d) => d.id).join('|'),
  active: window.Silinx.active?.id || '',
  view: window.Silinx.view,
  con: document.getElementById('console-log').innerText.length,
  toasts: document.querySelectorAll('.toast').length,
  text: window.Silinx.active?.editor?.getValue?.() ?? '',
  top: window.Silinx.project?.top,
  status: document.getElementById('status-text').textContent,
});`;

async function settle(page) {
  for (let i = 0; i < 8; i++) {
    const open = await page.eval(() => document.querySelectorAll('.dlg-overlay, .CodeMirror-dialog').length);
    if (!open) break;
    await page.eval(() => { const i = document.querySelector('.CodeMirror-dialog input'); if (i && !document.querySelector('.dlg-overlay')) i.focus(); });
    await page.key('Escape');
    await page.waitFor((n) => document.querySelectorAll('.dlg-overlay, .CodeMirror-dialog').length < n, [open], { timeout: 3000 }).catch(() => {});
  }
  await page.closeMenus();
  await page.waitFor(() => !window.Silinx.busy, [], { timeout: 30000, what: 'no process running' });
}

uiTest('every menu opens and every enabled item acts or opens its dialog', E, async (page) => {
  await makeProject(env, { name: 'MenuPj', template: 'blinky' });
  await page.eval(() => {
    // Check for Updates must not reach the network
    const orig = window.fetch;
    window.fetch = (u, o) => (String(u).includes('api.github.com')
      ? Promise.resolve(new Response(JSON.stringify({ tag_name: 'v1.0.0', html_url: 'https://github.com/x/y/releases/tag/v1.0.0', assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      : orig(u, o));
  });
  await page.eval(SIGNATURE);
  await page.openProject('MenuPj');
  // an editor with a change (so Undo / Redo / Find / templates have something to act on)
  await page.waitFor(() => window.SilinxApp.findDoc('summary'));
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor);
  await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.focus(); cm.setCursor({ line: 0, ch: 0 }); cm.replaceSelection('-- edited by the menu test\n'); });
  // File ▸ Close Project is tested with the projects; Print needs a diagram (diagram tests)
  const SKIP = new Set(['Close Project']);
  const MENUS = ['Edit', 'File', 'View', 'Project', 'Process', 'Tools', 'Help', 'Window'];
  const acted = [], idle = [], disabled = [], log = [];
  for (const m of MENUS) {
    const items = await page.openMenu(m);
    assert.ok(items.length > 0, `menu ${m} has items`);
    for (const it of items) {
      const name = `${m} ▸ ${it.label}`;
      if (SKIP.has(it.label)) continue;
      // Edit items act on the editor: make it the active document again
      if (m === 'Edit') await page.eval(() => { const d = window.SilinxApp.findDoc('file:src/top.vhd'); if (d && window.Silinx.active !== d) d.tab.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); });
      // a checked view item: start from the other view so that it has something to do
      if (m === 'View' && it.label === 'Implementation') { await page.closeMenus(); await page.click('input[name=view][value=sim]'); }
      // Design Summary: from another document
      if (m === 'View' && it.label === 'Design Summary') await page.eval(() => { const d = window.SilinxApp.findDoc('summary'); if (d) window.SilinxApp.closeDoc(d); });
      const now = await page.openMenu(m);
      const cur = now.find((x) => x.label === it.label);
      if (!cur) continue;                         // e.g. the Window list changed
      if (cur.disabled) { disabled.push(name); continue; }
      const idx = now.indexOf(cur);
      if (cur.submenu) {
        await page.hover(await page.point('body > .menu-popup > .mi', { index: idx }));
        await page.waitForSelector('.menu-popup.sub .mi');
        const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled') })));
        if (it.label === 'Language Templates' && subs.length && !subs[0].disabled) {
          const before = await page.eval(() => window.Silinx.active.editor.getValue());
          await page.click('.menu-popup.sub .mi', { index: 0 });
          await page.waitFor((b) => window.Silinx.active.editor.getValue() !== b, [before], { what: 'template inserted' });
          // keep the design valid for the processes run below
          await page.eval(() => { window.Silinx.active.editor.exec('undo'); window.Silinx.active.editor.exec('undo'); });
        }
        acted.push(`${name} (submenu: ${subs.map((s) => s.label).join(', ')})`);
        await settle(page);
        continue;
      }
      const before = await page.eval(() => window.__sig());
      await page.click('body > .menu-popup > .mi', { index: idx });
      const changed = await page.waitFor((b) => window.__sig() !== b, [before], { timeout: 8000 }).catch(() => false);
      (changed ? acted : idle).push(name);
      // what it did: an error message box is a failure
      await page.waitFor(() => !window.Silinx.busy, [], { timeout: 30000 });
      const what = await page.eval(() => ({
        dialogs: [...document.querySelectorAll('.dlg-overlay')].map((d) => `${d.querySelector('.dlg-title span').textContent}${d.querySelector('.msg-error') ? ` [ERROR: ${d.querySelector('.msg-text').textContent}]` : ''}`),
        docs: window.Silinx.docs.map((d) => d.title),
        last: document.getElementById('console-log').lastElementChild?.textContent,
      }));
      log.push(`${name}: ${JSON.stringify(what)}`);
      assert.ok(!what.dialogs.some((d) => d.includes('[ERROR')), `${name} showed an error: ${what.dialogs}`);
      await settle(page);
    }
    await settle(page);
  }
  assert.deepEqual(idle, [], `menu items that did nothing: ${idle.join(', ')}`);
  // the processes ran on a valid design: the simulator and the emulator opened
  const windows = log.filter((l) => l.startsWith('Window ▸')).map((l) => l.slice(9, l.indexOf(':')));
  for (const w of ['ISim (tb_top)', 'Board Emulator (top)', 'I/O Pin Planning', 'iMPACT', 'Design Summary']) assert.ok(windows.includes(w), `Window menu lists ${w}: ${windows}`);
  for (const must of ['File ▸ New Project…', 'File ▸ Open Project…', 'File ▸ Import Silinx ISE Project (.zip)…', 'File ▸ Export Silinx ISE Project (.zip)…',
    'File ▸ Import Xilinx ISE Project (.zip)…', 'File ▸ Export Xilinx ISE Project (.zip)…', 'File ▸ Recent Projects', 'Edit ▸ Undo', 'Edit ▸ Redo', 'Edit ▸ Find…',
    'Edit ▸ Replace…', 'Edit ▸ Go to Line…', 'Edit ▸ Language Templates', 'View ▸ Implementation', 'View ▸ Simulation', 'View ▸ Design Summary', 'View ▸ Language',
    'Project ▸ New Source…', 'Project ▸ Add Copy of Source…', 'Project ▸ Set as Top Module', 'Project ▸ Design Properties…', 'Project ▸ Sync with .xise',
    'Process ▸ Implement Top Module', 'Process ▸ Check Syntax', 'Process ▸ Simulate Behavioral Model',
    'Tools ▸ ASM State Machine Editor…', 'Tools ▸ I/O Pin Planning', 'Tools ▸ iMPACT (Configure Target Device)', 'Tools ▸ Board Emulator', 'Tools ▸ RTL Schematic',
    'Tools ▸ Toolchain Settings (ISE / Programmers)…', 'Help ▸ About Silinx ISE', 'Help ▸ Keyboard Shortcuts', 'Help ▸ Check for Updates…', 'Window ▸ Close All Documents']) {
    assert.ok(acted.some((a) => a.startsWith(must)), `${must} acted (acted: ${acted.join(', ')}; disabled: ${disabled.join(', ')})`);
  }
  // both exports were downloaded
  const fs = await import('node:fs/promises');
  const files = await fs.readdir(page.downloadDir);
  assert.ok(files.includes('MenuPj-silinx.zip') && files.includes('MenuPj.zip'), `downloads: ${files.join(', ')}`);
});

uiTest('dialogs close with Escape and only the topmost dialog handles Enter / Escape', E, async (page) => {
  await makeProject(env, { name: 'Dup' });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Dup');
  await page.dialogButton('Next >');
  await page.waitDialog('Replace Project');
  assert.equal(await page.dialogCount(), 2);
  // Escape closes only the confirmation (answer: no): the wizard stays on its first page
  await page.key('Escape');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1);
  assert.equal(await page.topDialogTitle(), 'New Project Wizard');
  await page.waitFor(() => /already exists: choose another name/.test(document.querySelector('.dlg-overlay .wiz').innerText));
  // Enter answers the topmost dialog only (Yes): the wizard goes to its next page, it is not finished
  await page.dialogButton('Next >');
  await page.waitDialog('Replace Project');
  await page.key('Enter');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  // Escape closes the wizard: nothing created or replaced
  await page.key('Escape');
  await page.waitNoDialog();
  const list = await env.server.api('GET', '/api/projects');
  assert.deepEqual(list.map((p) => p.name).filter((n) => n === 'Dup'), ['Dup']);
  assert.equal(await page.eval(() => window.Silinx.project), null);
  // the ✕ button and Cancel close dialogs too
  await page.menu('Help', 'Keyboard Shortcuts');
  await page.waitDialog('Keyboard Shortcuts');
  await page.click('.dlg-overlay .dlg-x');
  await page.waitNoDialog();
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('About shows the version and the GitHub link', E, async (page) => {
  await page.menu('Help', 'About Silinx ISE');
  await page.waitDialog('About');
  const info = await page.eval(() => {
    const d = document.querySelector('.dlg-overlay');
    return { text: d.innerText, links: [...d.querySelectorAll('a')].map((a) => ({ href: a.href, target: a.target })) };
  });
  const { VERSION, REPOSITORY } = await import('../../core/version.js');
  assert.match(info.text, new RegExp(`Version ${VERSION.replace(/\./g, '\\.')}`));
  assert.ok(info.links.some((l) => l.href === `https://github.com/${REPOSITORY}` && l.target === '_blank'), JSON.stringify(info.links));
  await page.key('Enter');
  await page.waitNoDialog();
});

uiTest('Check for Updates: newer release, up to date and a GitHub error (fetch stubbed, no network)', E, async (page) => {
  const { VERSION, REPOSITORY } = await import('../../core/version.js');
  const stub = (release, status = 200) => page.eval((rel, st) => {
    window.__ghCalls = [];
    window.__origFetch ||= window.fetch;
    window.fetch = (u, o) => {
      if (!/^https?:/.test(String(u)) || String(u).startsWith(location.origin)) return window.__origFetch(u, o);   // the Silinx server
      window.__ghCalls.push(String(u));
      if (!String(u).includes('api.github.com')) return Promise.reject(new Error('unexpected fetch'));
      return Promise.resolve(new Response(JSON.stringify(rel), { status: st, headers: { 'content-type': 'application/json' } }));
    };
  }, release, status);
  await stub({ tag_name: 'v99.1.0', name: 'v99.1.0', html_url: `https://github.com/${REPOSITORY}/releases/tag/v99.1.0`, published_at: '2026-01-02T00:00:00Z',
    assets: [{ name: 'silinx-ise-99.1.0.zip', browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v99.1.0/silinx-ise-99.1.0.zip`, size: 4096 }] });
  await page.menu('Help', 'Check for Updates…');
  await page.waitFor(() => /A new version is available: Silinx ISE 99\.1\.0/.test(document.querySelector('.dlg-overlay')?.innerText || ''));
  assert.ok(await page.eval(() => [...document.querySelectorAll('.dlg-overlay a')].some((a) => a.textContent === 'silinx-ise-99.1.0.zip')));
  assert.deepEqual(await page.eval(() => window.__ghCalls), [`https://api.github.com/repos/${REPOSITORY}/releases/latest`]);
  await page.key('Escape');
  await page.waitNoDialog();
  await stub({ tag_name: `v${VERSION}`, html_url: `https://github.com/${REPOSITORY}/releases` });
  await page.menu('Help', 'Check for Updates…');
  await page.waitFor(() => /is up to date/.test(document.querySelector('.dlg-overlay')?.innerText || ''));
  await page.key('Escape');
  await page.waitNoDialog();
  await stub({ message: 'API rate limit exceeded' }, 403);
  await page.menu('Help', 'Check for Updates…');
  await page.waitFor(() => /Could not check for updates: GitHub rate limit/.test(document.querySelector('.dlg-overlay')?.innerText || ''));
  await page.key('Escape');
  await page.waitNoDialog();
});

uiTest('Portuguese: View ▸ Language switches the UI; menus, dialogs and the main window have no untranslated text', E, async (page) => {
  await makeProject(env, { name: 'LangPj', template: 'blinky' });
  await page.openProject('LangPj');
  await page.waitFor(() => window.SilinxApp.findDoc('summary') && document.querySelector('.summary-table'));
  await page.eval(TEXTS);
  // data shown in the UI that is not translated (names from the project, the device database, the server)
  const db = await env.server.api('GET', '/api/devices');
  const tc = await env.server.api('GET', '/api/toolchain');
  const projects = (await env.server.api('GET', '/api/projects')).flatMap((p) => [p.name, p.top, p.board]);
  const data = new Set([...projects, ...db.boards.map((b) => b.name), tc.ise.help, tc.ise.reason, 'LangPj', 'top', 'tb_top', 'basys2', 'in', 'out', 'inout',
    'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader']);
  const same = [/^\(.*\)$/, /^LangPj\//, /^constraints\//, { test: (s) => data.has(s) }];
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where, collect) => {
    await setLang('en'); const en = await collect();
    await setLang('pt'); const pt = await collect();
    for (const s of untranslated(en, pt, same)) missing.push(`${where}: ${s}`);
  };
  await compare('main window', () => page.eval(() => window.__uiTexts()));
  for (const m of ['File', 'Edit', 'View', 'Project', 'Process', 'Tools', 'Window', 'Help']) {
    await setLang('en');
    await page.openMenu(m);
    await compare(`menu ${m}`, () => page.eval(() => window.__uiTexts(document.querySelector('body > .menu-popup'))));
    await page.closeMenus();
  }
  const dialogs = [['File', 'New Project…', 3, 'Zz9'], ['File', 'Open Project…'], ['File', 'Import Silinx ISE Project (.zip)…'], ['File', 'Import Xilinx ISE Project (.zip)…'],
    ['Project', 'New Source…', 3, 'zz9'], ['Project', 'Add Copy of Source…'], ['Project', 'Design Properties…'], ['Tools', 'Toolchain Settings (ISE / Programmers)…'],
    ['Help', 'About Silinx ISE'], ['Help', 'Keyboard Shortcuts']];
  for (const [m, it, pages = 1, name] of dialogs) {
    await setLang('en');
    await page.menu(m, it);
    await page.waitDialog();
    for (let k = 0; k < pages; k++) {
      await compare(`dialog '${it}'${pages > 1 ? ` page ${k + 1}` : ''}`, () => page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay'))));
      if (k < pages - 1) {
        await setLang('en');
        if (k === 0) await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
        const h3 = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent);
        await page.dialogButton('Next >');
        await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3').textContent !== t, [h3]);
      }
    }
    await settle(page);
  }
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
  // through the menu, as a user does it: View ▸ Language ▸ Português, and back
  await setLang('en');
  const items = await page.openMenu('View');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((i) => i.label === 'Language') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  await page.click('.menu-popup.sub .mi', { text: 'Português' });
  await page.waitFor(() => document.querySelector('#menubar .item').textContent === 'Ficheiro');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#menubar .item')].map((e) => e.textContent)),
    ['Ficheiro', 'Editar', 'Ver', 'Projeto', 'Processo', 'Ferramentas', 'Janela', 'Ajuda']);
  assert.equal(await page.eval(() => document.documentElement.lang), 'pt');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.lang')), 'pt');
  // the choice survives a reload; user content (console, hierarchy names) is not translated
  await page.goto(env.server.url);
  await page.waitFor(() => document.querySelector('#menubar .item')?.textContent === 'Ficheiro' && window.Silinx?.project?.name === 'LangPj');
  await page.waitFor(() => document.querySelector('#hier .lbl'));
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'top')));
  assert.match(await page.consoleText(), /Project "LangPj" opened/);
  const v = await page.openMenu('Ver');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: v.findIndex((i) => i.label === 'Idioma') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  await page.click('.menu-popup.sub .mi', { text: 'English' });
  await page.waitFor(() => document.querySelector('#menubar .item').textContent === 'File');
});
