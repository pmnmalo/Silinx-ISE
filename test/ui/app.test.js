// UI: application shell — boot, menus and their items, dialogs (Escape / Enter on the topmost
// one only), About, Check for Updates, language switch, keyboard shortcuts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly, BROWSER, PageGoneError } from './harness.js';
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
  palette: document.querySelectorAll('.pal-overlay').length,
  text: window.Silinx.active?.editor?.getValue?.() ?? '',
  top: window.Silinx.project?.top,
  status: document.getElementById('status-text').textContent,
});`;

async function settle(page) {
  for (let i = 0; i < 8; i++) {
    const open = await page.eval(() => document.querySelectorAll('.dlg-overlay, .CodeMirror-dialog, .pal-overlay').length);
    if (!open) break;
    await page.eval(() => { const i = document.querySelector('.CodeMirror-dialog input'); if (i && !document.querySelector('.dlg-overlay')) i.focus(); });
    await page.key('Escape');
    await page.waitFor((n) => document.querySelectorAll('.dlg-overlay, .CodeMirror-dialog, .pal-overlay').length < n, [open], { timeout: 3000 }).catch(() => {});
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
      // (a failure names the item before, whose effect may be in the way)
      const now = await page.openMenu(m).catch(async (e) => { throw new Error(`menu ${m} for ${name}, after ${log.at(-1) || acted.at(-1) || 'none'}: ${e.message}; overlays: ${await page.eval(() => [...document.querySelectorAll('.dlg-overlay, .pal-overlay, .menu-popup, .CodeMirror-dialog')].map((x) => x.className).join(', '))}`); });
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
      // the FPGA view first asks the server for the routed design, then (none here) asks whether to
      // run Implement Design: wait for that question, which can come after the other checks
      if (it.label === 'Implemented Design (FPGA View)') await page.waitDialog('View Implemented Design (FPGA)');
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
    'Project ▸ New Source…', 'Project ▸ Add Copy of Source…', 'Project ▸ Design Properties…', 'Project ▸ Sync with .xise',
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

uiTest('Toolchain Settings: the SSH mode takes a Docker image on the remote host (e.g. an Intel Mac)', E, async (page) => {
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay select').options].map((o) => o.textContent)),
    ['Local (Xilinx ISE installed locally)', 'Docker image with Xilinx ISE', 'Remote host with Xilinx ISE via SSH', 'Silinx toolchain (experimental, no ISE)']);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select'); s.value = 'ssh'; s.dispatchEvent(new Event('change')); });
  const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent));
  assert.deepEqual(labels.slice(1, 7), ['Host:', 'User:', 'Port:', 'Remote build dir:', 'Docker image on the remote host:', 'Remote settings64.sh:']);
  const field = (label) => page.eval((l) => { const ls = [...document.querySelectorAll('.dlg-overlay .form-grid label')]; const i = ls.findIndex((x) => x.textContent === l); return ls[i].nextElementSibling.placeholder; }, label);
  assert.equal(await field('Docker image on the remote host:'), 'none: ISE installed on the host');
  const set = (label, v) => page.eval((l, val) => { const ls = [...document.querySelectorAll('.dlg-overlay .form-grid label')]; const inp = ls.find((x) => x.textContent === l).nextElementSibling; inp.value = val; }, label, v);
  await set('Host:', 'mini'); await set('User:', 'dev'); await set('Docker image on the remote host:', ' xilinx/ise:14.7 ');
  await page.dialogButton('Save');
  await page.waitNoDialog();
  await page.waitConsole(/Toolchain settings saved \(ssh: remote host dev@mini \(docker image xilinx\/ise:14\.7\)\)/);
  const tc = await env.server.api('GET', '/api/toolchain');
  assert.equal(tc.config.mode, 'ssh');
  assert.equal(tc.config.ssh.image, 'xilinx/ise:14.7');
  // reopened, the dialog shows it; emptied, the host's own ISE is used again
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select').value), 'ssh');
  assert.equal(await page.eval(() => { const ls = [...document.querySelectorAll('.dlg-overlay .form-grid label')]; return ls.find((x) => x.textContent === 'Docker image on the remote host:').nextElementSibling.value; }), 'xilinx/ise:14.7');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await env.server.api('PUT', '/api/toolchain', { mode: 'local', ssh: { host: '', user: '', image: '' } });
});

uiTest('the test harness opens a menu even when its first click is lost (as on slow CI machines)', E, async (page) => {
  // the next press on the menu bar is swallowed before the app sees it
  await page.eval(() => document.getElementById('menubar').addEventListener('mousedown', (e) => e.stopImmediatePropagation(), { capture: true, once: true }));
  const items = await page.openMenu('Help');
  assert.ok(items.some((i) => i.label === 'About Silinx ISE'), JSON.stringify(items));
  await page.closeMenus();
});

uiTest('the test harness opens the right menu when the menu bar moves under the pointer (as when a project opens)', E, async (page) => {
  // the first time the pointer reaches the menu bar, the bar shifts by one title: a click at the
  // position taken before lands on the next menu (on CI: Edit opened instead of File)
  await page.eval(() => {
    const bar = document.getElementById('menubar');
    bar.addEventListener('mousemove', () => { bar.style.paddingLeft = `${bar.querySelector('.item').getBoundingClientRect().width + 4}px`; }, { once: true });
  });
  const items = await page.openMenu('File');
  assert.ok(items.some((i) => i.label === 'New Project…'), JSON.stringify(items.map((i) => i.label)));
  await page.closeMenus();
  await page.eval(() => { document.getElementById('menubar').style.paddingLeft = ''; });
});

// Firefox / WebKit: the page ended by the browser itself (WebKit's web process on CI, #237), here its
// Playwright page closed under the harness
let goneRuns = 0;
uiTest('the test harness: a page the browser ends is said at once, not as a timeout, and the test is run once more in a fresh page, the projects of the first run removed (#237)', E, async (page) => {
  goneRuns++;
  if (goneRuns === 1) {
    await makeProject(env, { name: 'GonePj' });
    // (Chromium: its renderer crashed, as WebKit's in the Yosys test, #110; else the page closed)
    const crash = BROWSER === 'chromium';
    if (crash) await page.page.goto('chrome://crash').catch(() => {}); else await page.page.close();
    const t0 = Date.now();
    await assert.rejects(page.waitFor(() => false, [], { what: 'nothing', timeout: 20000 }), (e) => e instanceof PageGoneError && new RegExp(`^${BROWSER} ${crash ? 'crashed' : 'closed'} the page`).test(e.message));
    assert.ok(Date.now() - t0 < 5000, `said after ${Date.now() - t0} ms`);
    await page.eval(() => 1);   // (fails this run: the test is run once more)
    assert.fail('the closed page answered');
  }
  assert.equal(goneRuns, 2);
  await makeProject(env, { name: 'GonePj' });   // (409 if the first run's project were left)
  await page.openProject('GonePj');
}, { skip: BROWSER === 'chrome' ? 'Firefox / WebKit (Playwright) only' : undefined });

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
  // copyright, licence and the open-source components (collapsed, then opened)
  assert.match(info.text, /Digital design platform for Xilinx FPGAs[\s\S]*made for teaching[\s\S]*FSM and ASM state machine editors[\s\S]*truth tables and Karnaugh maps[\s\S]*board emulator/);
  // what synthesizes and programs (#299): the Silinx toolchain, or ISE; programming from the browser too
  assert.ok(info.text.includes('a board emulator; synthesis, place & route and bitstreams with the Silinx toolchain (the Basys2 and Nexys2 boards) or with ISE 14.7; programming of the FPGA and its Platform Flash, also from the browser over USB.'), info.text);
  assert.ok(info.text.includes('Synthesis, place & route and bitstream generation use the Silinx toolchain (Yosys, and the place & route and bitstream writer of Silinx) for the Spartan-3E boards, or the Xilinx ISE 14.7 command-line tools.'), info.text);
  assert.doesNotMatch(info.text, /device programming with ISE|use the Xilinx ISE 14\.7 command-line tools\./);
  assert.match(info.text, /Copyright 2026 Pedro Maló\. Free software under the GNU Affero General Public License v3\.0/);
  assert.match(info.text, /ABSOLUTELY NO WARRANTY\. Source code: github\.com\//);
  // usage counts: none here (only the published site counts, with GoatCounter)
  assert.match(info.text, /Usage counts:\s+None: this copy sends nothing\. Only the site \(pmnmalo\.github\.io\/Silinx-ISE\) counts its visits, with GoatCounter \(no cookies, no personal data\)\./);
  assert.ok(info.links.some((l) => l.href === 'https://www.goatcounter.com/' && l.target === '_blank'), 'GoatCounter linked');
  assert.match(info.text, /Using Silinx in a course\? Tell us who you are\./);
  assert.doesNotMatch(info.text, /Privacy: the site/);
  assert.ok(info.links.some((l) => l.href.endsWith('/THIRD-PARTY-NOTICES.md')));
  const { THIRD_PARTY } = await import('../../core/third-party.js');
  await page.click('.dlg-overlay .about-oss summary');
  const rows = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .about-components tr')].slice(1).map((r) => [...r.cells].map((c) => c.textContent).join('|')));
  assert.equal(rows.length, THIRD_PARTY.length);
  assert.ok(rows.includes(`elkjs|${THIRD_PARTY.find((c) => c.name === 'elkjs').version}|EPL-2.0`), rows.join('\n'));
  assert.ok(rows.some((r) => /^codemirror\|[\d.]+\|MIT$/.test(r)));
  await page.key('Enter');
  await page.waitNoDialog();
  // in Portuguese (#299)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ajuda', 'Acerca do Silinx ISE');
    await page.waitDialog('Acerca');
    const pt = await page.eval(() => document.querySelector('.dlg-overlay').innerText);
    assert.ok(pt.includes('um emulador da placa; síntese, place & route e bitstreams com a toolchain Silinx (as placas Basys2 e Nexys2) ou com o ISE 14.7; programação da FPGA e da sua Platform Flash, também a partir do browser por USB.'), pt);
    assert.ok(pt.includes('A síntese, o place & route e a geração do bitstream usam a toolchain Silinx (o Yosys, e o place & route e o gerador de bitstreams do próprio Silinx) para as placas Spartan-3E, ou as ferramentas de linha de comandos do Xilinx ISE 14.7.'), pt);
    await page.key('Enter');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
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
  // the release, then its changelog (What's new; refused here: the dialog shows without it)
  assert.deepEqual(await page.eval(() => window.__ghCalls), [`https://api.github.com/repos/${REPOSITORY}/releases/latest`, `https://raw.githubusercontent.com/${REPOSITORY}/v99.1.0/CHANGELOG.md`]);
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
        // the name: on the first page that asks it (New Source: the page after the type)
        if (await page.eval(() => { const i = document.querySelector('.dlg-overlay .wiz-main input[type=text]'); return !!i && !i.value; })) await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
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

uiTest('at start-up the app checks for updates: a newer release opens the update dialog, the same version only logs a line', E, async (page) => {
  // turn the start-up check on again, with GitHub stubbed (no network): first a newer release
  const stub = (tag) => `window.SILINX_NO_UPDATE_CHECK = false;
    (() => { const orig = window.fetch; window.fetch = (u, o) => (String(u).includes('raw.githubusercontent.com') ? Promise.resolve(new Response('', { status: 404 })) : String(u).includes('api.github.com')
      ? Promise.resolve(new Response(JSON.stringify({ tag_name: '${tag}', name: '${tag}', html_url: 'https://github.com/x/y/releases/tag/${tag}', assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      : orig(u, o)); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub('v99.0.0') });
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  await page.waitDialog('Check for Updates');
  await page.waitFor(() => /A new version is available: Silinx ISE 99\.0\.0/.test([...document.querySelectorAll('.dlg-overlay')].pop()?.innerText || ''), [], { what: 'update dialog text' });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // the version running is the latest: no dialog, one line in the console
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  const version = await page.eval(async () => (await import('/core/version.js')).VERSION);
  const s2 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub(`v${version}`) });
  await page.eval(() => localStorage.removeItem('silinx.updateCheck'));   // (the answer of the first load is kept an hour)
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  await page.waitConsole(/is up to date \(latest release on GitHub/);
  assert.equal(await page.dialogCount(), 0);
  // reloaded again within the hour: GitHub is not asked (its rate limit), the kept answer is used
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s2.identifier });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `${stub('v99.0.0')}
    (() => { const f = window.fetch; window.__gh = 0; window.fetch = (u, o) => (String(u).includes('api.github.com') && window.__gh++, f(u, o)); })();` });
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  await page.waitConsole(/is up to date \(latest release on GitHub/);
  assert.equal(await page.eval(() => window.__gh), 0);
  assert.equal(await page.dialogCount(), 0);
}, { skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument and its removal)

// #339 regression: at start-up the last project is reopened while the toolchain check runs; its two warnings
// on a machine with neither ISE nor a programmer (CI's) were in the Warnings tab or not by which came first
// (opening a project clears the tabs). Now, coming after the project opened, they are in the console only.
// The check's answer held until the project is open, made to say ISE not available and no programmer.
uiTest('#339 the start-up checks answering after the last project reopened: their warnings in the console, not in the Warnings tab', E, async (page) => {
  await makeProject(env, { name: 'StartLate', files: {} });
  await page.openProject('StartLate');   // (the last project: reopened at start-up)
  const s = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const orig = window.fetch;
    window.fetch = async (u, o) => {
      if (!/\\/api\\/toolchain$/.test(String(u)) || window.__tcHeld) return orig(u, o);
      window.__tcHeld = true;
      const tc = await (await orig(u, o)).json();
      while (!(window.Silinx?.project && document.querySelector('#hier .row'))) await new Promise((r) => setTimeout(r, 20));
      tc.ise = { ...tc.ise, mode: 'docker', available: false, reason: 'held by the test' };
      tc.programmers = {};
      return new Response(JSON.stringify(tc), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  })();` });
  await page.reload();
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s.identifier });
  assert.equal(await page.eval(() => window.__tcHeld), true);
  assert.equal(await page.eval(() => window.Silinx.project?.name), 'StartLate');
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn')].map((l) => l.textContent));
  assert.deepEqual(lines, ['Toolchain: ISE not available (docker: held by the test).', 'Programmers found: none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)']);
  // (the messages of the tabs, then the tabs as drawn)
  assert.deepEqual(await page.eval(() => window.Silinx.diags.map((d) => d.message)), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, document.getElementById('err-count').textContent]), ['', '']);
}, { skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument)

uiTest("update dialog: What's new lists the changes of every version newer than the one running (text only)", E, async (page) => {
  const version = await page.eval(async () => (await import('/core/version.js')).VERSION);
  const cl = `# Changelog\n\n## 99.1.0\n\n- **Big** feature with \`code\` and *style*\n- <img src=x onerror="window.__pwned=1"> shown as text\n\n## 99.0.0\n\n- Another change\n  continued line\n\n## ${version}\n\n- already running\n`;
  await page.eval((text) => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const s = String(u);
      if (s.includes('api.github.com')) return Promise.resolve(new Response(JSON.stringify({ tag_name: 'v99.1.0', name: 'v99.1.0', html_url: 'https://github.com/x/y/releases/tag/v99.1.0', assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      if (s.includes('raw.githubusercontent.com') && s.endsWith('/v99.1.0/CHANGELOG.md')) return Promise.resolve(new Response(text, { status: 200 }));
      return orig(u, o);
    };
  }, cl);
  await page.menu('Help', 'Check for Updates…');
  await page.waitDialog('Check for Updates');
  await page.waitFor(() => document.querySelector('.dlg-overlay .whats-new'), [], { what: "What's new" });
  const box = await page.eval(() => {
    const b = document.querySelector('.dlg-overlay .whats-new');
    return { text: b.innerText, bold: [...b.querySelectorAll('b')].map(x => x.textContent), code: [...b.querySelectorAll('code')].map(x => x.textContent), imgs: b.querySelectorAll('img').length };
  });
  assert.match(box.text, /Silinx ISE 99\.1\.0[\s\S]*Big feature with code and style[\s\S]*Silinx ISE 99\.0\.0[\s\S]*Another change continued line/);
  assert.doesNotMatch(box.text, /already running/);   // the running version is not listed
  assert.deepEqual(box.bold, ['Big']);
  assert.deepEqual(box.code, ['code']);
  assert.equal(box.imgs, 0);
  assert.match(box.text, /<img src=x onerror="window.__pwned=1"> shown as text/);
  assert.equal(await page.eval(() => window.__pwned ?? null), null);
  await page.dialogButton('OK');
  await page.waitNoDialog();
});

uiTest('Design Summary: once closed it reopens from the Processes panel whatever is selected, in both views, and from the toolbar', E, async (page) => {
  await makeProject(env, { name: 'SumPj', template: 'blinky' });
  await page.openProject('SumPj');
  await page.waitFor(() => window.SilinxApp.findDoc('summary'));
  const close = async () => {
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('summary')));
    await page.waitFor(() => !window.SilinxApp.findDoc('summary'));
  };
  const reopenFromProcesses = async (what) => {
    await close();
    await page.treeRow('#procs', 'Design Summary/Reports', { dbl: true, exact: true });
    await page.waitFor(() => window.Silinx.active?.id === 'summary' && /Project Status/.test(document.querySelector('.doc:not([hidden])').innerText), [], { what: `summary reopened (${what})` });
  };
  // a module (Implementation view), the constraints file, the Simulation view (test bench and nothing selected)
  await page.treeRow('#hier', 'top', {});
  await reopenFromProcesses('module');
  await page.treeRow('#hier', 'top.ucf', {});
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Check Constraints')), 'the UCF processes are kept');
  await reopenFromProcesses('constraints file');
  await page.click('input[name=view][value=sim]');
  await reopenFromProcesses('Simulation view, nothing selected');
  assert.ok(!await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'No processes for the selected item')));
  await page.treeRow('#hier', 'tb_top', {});
  await reopenFromProcesses('test bench');
  // the toolbar button
  await close();
  await page.click('#toolbar .tb-btn[data-cmd=summary]');
  await page.waitFor(() => window.Silinx.active?.id === 'summary');
});

uiTest('a reload comes back to where the user was: the open documents, the one in front, the left pane, the Design view (#160)', E, async (page) => {
  await makeProject(env, { name: 'ViewPj', template: 'blinky' });
  await page.openProject('ViewPj');
  const where = () => page.eval(() => ({ docs: window.Silinx.docs.map((d) => d.id), active: window.Silinx.active?.id, view: window.Silinx.view,
    page: document.querySelector('#left-tabs .tab.active')?.dataset.page }));
  const opened = (ids) => page.waitFor((want) => want.every((id) => window.Silinx.docs.some((d) => d.id === id)), [ids], { what: `documents ${ids.join(', ')}`, timeout: 30000 });
  // the first opening: the Design Summary
  await opened(['summary']);
  assert.deepEqual((await where()).docs, ['summary']);
  // documents, the Simulation view, the Files pane; top.vhd in front
  await page.eval(() => window.SilinxApp.openFile('src/counter.v'));
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.eval(() => window.SilinxApp.openImpact());
  await opened(['file:src/counter.v', 'file:src/top.vhd', 'impact']);
  await page.click('input[name=view][value=sim]');
  await page.click('#left-tabs .tab[data-page=files]');
  await page.click('#doc-tabs .tlabel', { text: 'top.vhd' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd in front', timeout: 30000 });
  const before = await where();
  assert.deepEqual(before, { docs: ['summary', 'file:src/counter.v', 'file:src/top.vhd', 'impact'], active: 'file:src/top.vhd', view: 'sim', page: 'files' });
  await page.reload();
  await opened(before.docs);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd in front again' });
  assert.deepEqual(await where(), before);
  assert.equal(await page.eval(() => document.querySelector('input[name=view][value=sim]').checked), true);
  // a document closed stays closed; one whose file is gone is not reopened (no message)
  await page.eval(async () => { await window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === 'impact')); });
  await page.eval(() => { const k = 'silinx.view.ViewPj'; const v = JSON.parse(localStorage.getItem(k)); v.open.push('file:src/gone.vhd'); localStorage.setItem(k, JSON.stringify(v)); });
  await page.reload();
  await opened(['summary', 'file:src/counter.v', 'file:src/top.vhd']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd in front', timeout: 30000 });
  assert.deepEqual((await where()).docs, ['summary', 'file:src/counter.v', 'file:src/top.vhd']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay')), null, 'no message');
  // another project, opened for the first time: its Design Summary
  await makeProject(env, { name: 'ViewPj2', template: 'blinky' });
  await page.openProject('ViewPj2');
  await opened(['summary']);
  assert.deepEqual((await where()).docs, ['summary']);
  // and back: ViewPj as it was left
  await page.openProject('ViewPj');
  await opened(['summary', 'file:src/counter.v', 'file:src/top.vhd']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd in front', timeout: 30000 });
});

uiTest('a reload comes back to the simulation (ISim) and the board emulator, run again for the same module (#163)', E, async (page) => {
  await makeProject(env, { name: 'ViewSim', template: 'blinky' });
  await page.openProject('ViewSim');
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'summary'), [], { what: 'the project open', timeout: 30000 });
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'ISim', timeout: 30000 });
  await page.click('input[name=view][value=impl]');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'board emulator', timeout: 30000 });
  const docs = () => page.eval(() => ({ docs: window.Silinx.docs.map((d) => `${d.id} ${d.title}`), active: window.Silinx.active?.id }));
  const before = await docs();
  assert.deepEqual(before, { docs: ['summary Design Summary', 'isim ISim (tb_top)', 'emulator Board Emulator (top)'], active: 'emulator' });
  assert.deepEqual(await page.eval(() => JSON.parse(localStorage.getItem('silinx.view.ViewSim')).open), ['summary', 'isim:tb_top', 'emulator:top']);
  await page.reload();
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && window.Silinx.docs.find((d) => d.id === 'isim')?.view, [], { what: 'ISim and the emulator again', timeout: 60000 });
  assert.deepEqual(await docs(), before);
  // a netlist model that is gone: not reopened, no message
  await page.eval(() => { const k = 'silinx.view.ViewSim'; const v = JSON.parse(localStorage.getItem(k)); v.open = ['summary', 'isim:tb_top@postsynth']; v.active = 'isim:tb_top@postsynth'; localStorage.setItem(k, JSON.stringify(v)); });
  await page.reload();
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'summary'), [], { what: 'the project open', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual((await docs()).docs, ['summary Design Summary']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay')), null, 'no message');
}, { timeout: 180000 });
