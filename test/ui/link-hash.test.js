// UI: a link given to a Silinx already running (#3316, web/js/link-hash.js): the address's hash changed without the page
// loading again opens the link as a fresh load does (web/js/link-open.js), in both interfaces: an example's link into
// Try it, as a fresh load of the same link; a zip at another site asked first (Cancel: nothing fetched); a refused
// address said in the console, nothing made; an open document's changes saved before the link opens, once the user
// agrees (#3362), and one that cannot be saved keeps the link from opening (the work kept); a hash that is no link, or a
// link not agreed to, saves nothing (#3362); a shared project's link read first (#3531): a broken one said, nothing
// saved, the page not loaded again; a good one asked as a design's, nothing saved in the page that shares, then the
// page loaded again, which follows it; an address's token left alone. The console's messages asserted, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setupUi, uiTest, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => re.test(l));
const projects = async () => (await fs.readdir(env.server.workspace)).filter((f) => !f.startsWith('.')).sort();
async function boot(page, hash = '', query = 'h=1') {
  await page.goto(`${env.server.url}/?${query}${hash ? `#${hash}` : ''}`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.startupChecked && window.Silinx.linksWatched, [], { what: 'app boot' });
}
// the hash changed in the running app (as a link pasted in the address bar): no load of the page
async function setHash(page, hash) {
  await page.eval((h) => { window.__loaded = true; window.Silinx.linkOpened = false; location.hash = h; }, hash);
}
const linkOpened = (page) => page.waitFor(() => window.Silinx.linkOpened, [], { what: 'the link opened', timeout: 60000 });
// what a link left: the project, the document in front, Try it running, the address, the link's console lines
const outcome = (page) => page.eval(() => ({
  project: window.Silinx.project?.name, active: window.Silinx.active?.id || null, hash: location.hash,
  trying: !!window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating,
  lines: window.__console().split('\n').map((l) => l.trim()).filter((l) => /from a link|Open from a link/.test(l)).map((l) => l.replace(' (a new project)', '')),
}));

uiTest('#3316 an example\'s link given to the running app opens it into Try it, as a fresh load of the same link; the address cleared, the page not loaded again', E, async (page) => {
  await boot(page);
  await setHash(page, 'open=example:gates&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating, [], { what: 'Try it running', timeout: 60000 });
  await page.waitConsole(/Opened 'gates' from a link \(a new project\): Try it\./);
  assert.equal(await page.eval(() => window.__loaded), true, 'the same page');
  const changed = await outcome(page);
  assert.deepEqual(changed, { project: 'gates', active: 'sch:src/gates.sch.json', hash: '', trying: true, lines: ['Opened \'gates\' from a link: Try it.'] });
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
  // a fresh load of the same link: the same
  await boot(page, 'open=example:gates&view=try', 'h=2');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating, [], { what: 'Try it running', timeout: 60000 });
  assert.deepEqual(await outcome(page), changed);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
  // a second link in the same page: the next project, the first one's documents closed
  await setHash(page, 'open=example:traffic&top=traffic&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json')?.fsmEditor?.panel === 'sim', [], { what: 'the FSM\'s Try it panel', timeout: 30000 });
  await page.waitConsole(/Opened 'traffic' from a link \(a new project\): Try it\./);
  assert.equal(await page.eval(() => window.Silinx.docs.some((d) => d.project === 'gates')), false);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
  assert.deepEqual(warnings(page), []);
});

uiTest('#3316 a zip at another site is asked first (Cancel: nothing fetched); refused addresses said in the console as at a fresh load, nothing made', E, async (page) => {
  await boot(page);
  const before = await projects();
  await page.eval(() => { window.__fetched = []; const real = window.fetch; window.fetch = (u, o) => { if (!String(u).startsWith('/')) window.__fetched.push(String(u)); return real(u, o); }; });
  await setHash(page, 'open=https://example.org/lecture3.zip&view=simulate');
  await page.waitDialog('Open from a Link');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^This link opens a project from another site:\s+https:\/\/example\.org\/lecture3\.zip\s+Open it\? Its files are copied into a new project of your workspace; nothing runs until you run it\.$/);
  await page.dialogButton('Cancel');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: cancelled\./);
  assert.deepEqual(await page.eval(() => window.__fetched), [], 'nothing fetched');
  const refused = [
    ['open=https://192.168.1.1/a.zip', 'the link\'s open= is an address of this computer or of a local network (\'192.168.1.1\')'],
    ['open=javascript:alert(1)', 'the link\'s open= is not an https address (\'javascript:alert(1)\')'],
    ['open=example:gates&top=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', 'the link\'s top \'<img src=x onerror=alert(1)>\' is not a module name'],
    ['open=example:nothere', 'no example \'nothere\''],
  ];
  for (const [hash, msg] of refused) {
    await setHash(page, hash);
    await page.waitFor((m) => window.__console().includes(`ERROR: Open from a link: ${m}.`), [msg], { what: msg, timeout: 30000 });
    assert.equal(await page.eval(() => document.querySelectorAll('#console img, .dlg-overlay img').length), 0, 'no markup from the link');
  }
  assert.equal(await page.dialogCount(), 0);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), refused.map(([, m]) => `ERROR: Open from a link: ${m}.`));
  // the same at a fresh load
  await boot(page, refused[0][0], 'h=2');
  await page.waitConsole(/ERROR: Open from a link: the link's open= is an address of this computer or of a local network \('192\.168\.1\.1'\)\./);
  assert.deepEqual(await projects(), before);
  assert.equal(await page.eval(() => window.__loaded), undefined, 'a fresh page');
  assert.deepEqual(warnings(page), []);
});

uiTest('#3316 an open document\'s changes are saved before the link opens; one that cannot be saved keeps the link from opening, the work kept', E, async (page) => {
  await boot(page, 'open=example:blinky');
  await linkOpened(page);
  await page.eval(() => window.SilinxApp.openFile('src/knight.vhd'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/knight.vhd' && window.Silinx.active.editor, [], { what: 'the VHDL open' });
  // an edit not saved yet (its autosave held back): the user asked, then saved first
  await page.eval(() => { const d = window.Silinx.active; d.editor.setValue(`-- the student's note\n${d.editor.getValue()}`); clearTimeout(d._autosave); });
  await setHash(page, 'open=example:traffic');
  await page.waitDialog('Open from a Link');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), 'This link opens \'traffic\'. Your open documents have changes not saved yet: save them, then open it?');
  await page.dialogButton('Save and Open');
  await linkOpened(page);
  await page.waitConsole(/Opened 'traffic' from a link( \(a new project\))?\./);
  assert.match(await readWs(env, 'blinky', 'src/knight.vhd'), /^-- the student's note\n/);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
  // a document that cannot be saved: the link not opened, the document and its changes kept
  await page.eval(() => window.SilinxApp.openFile('src/timer.vhd'));
  const file = await page.waitFor(() => window.Silinx.active?.editor && window.Silinx.active.project === 'traffic' && window.Silinx.active.path, [], { what: 'a source open' });
  await page.eval(() => { const d = window.Silinx.active; d.save = async () => { throw new Error('the disk is full'); }; d.editor.setValue(`-- kept\n${d.editor.getValue()}`); clearTimeout(d._autosave); });
  await page.eval(() => { window.__loaded = true; location.hash = 'open=example:clock'; });
  await page.waitDialog('Open from a Link');
  await page.dialogButton('Save and Open');
  const refusal = `ERROR: Open from a link: ${file} could not be saved: the link was not opened; your changes are kept.`;
  await page.waitFor((m) => window.__console().includes(m), [refusal], { what: 'the refusal', timeout: 30000 });
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), [`ERROR: cannot save ${file}: the disk is full. Your changes are kept and saved as soon as it is possible again.`, refusal]);
  assert.equal(await page.eval(() => window.Silinx.project.name), 'traffic');
  assert.equal(await page.eval((f) => window.Silinx.docs.some((d) => d.path === f && d.dirty && d.editor.getValue().startsWith('-- kept\n')), file), true);
  assert.equal(await page.dialogCount(), 0);
  assert.equal(await fs.access(`${env.server.workspace}/clock`).then(() => true, () => false), false);
});

uiTest('#3362 a hash that is no link, or a link the user does not agree to, saves nothing', E, async (page) => {
  await boot(page, 'open=example:stopwatch');
  await linkOpened(page);
  await page.eval(() => window.SilinxApp.openFile('src/debounce.vhd'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/debounce.vhd' && window.Silinx.active.editor, [], { what: 'the VHDL open' });
  const disk = await readWs(env, 'stopwatch', 'src/debounce.vhd');
  // an edit not saved yet (its autosave held back), its saves counted
  await page.eval(() => {
    const d = window.Silinx.active, save = d.save.bind(d);
    window.__saves = 0;
    d.save = async (...a) => { window.__saves++; return save(...a); };
    d.editor.setValue(`-- not saved\n${d.editor.getValue()}`);
    clearTimeout(d._autosave);
  });
  const untouched = async () => {
    assert.equal(await page.eval(() => window.__saves), 0);
    assert.equal(await page.eval(() => window.Silinx.active.dirty), true);
    assert.equal(await readWs(env, 'stopwatch', 'src/debounce.vhd'), disk);
  };
  // not a link, a broken link, a refused address: said (or nothing to say), nothing saved
  for (const [hash, line] of [['nothing=1', null], ['design=%%%', 'ERROR: Open from a link: the link\'s design is not well encoded.'],
    ['open=https://192.168.1.1/a.zip', 'ERROR: Open from a link: the link\'s open= is an address of this computer or of a local network (\'192.168.1.1\').'],
    // (a shared project's broken link, #3531: said, the hash cleared, the page not loaded again)
    ['follow=x', 'ERROR: Follow a shared project: the link to follow is broken (copy it again from the owner\'s Share Project).'], ['edit=x', 'ERROR: Follow a shared project: the link to follow is broken (copy it again from the owner\'s Share Project).']]) {
    const said = () => page.eval((m) => window.__console().split('\n').filter((l) => l.trim() === m).length, line);
    const before = line ? await said() : 0;
    await setHash(page, hash);
    if (line) await page.waitFor((m, n) => window.__console().split('\n').filter((l) => l.trim() === m).length > n, [line, before], { what: line, timeout: 30000 });
    else await new Promise((r) => setTimeout(r, 300));
    await untouched();
    if (/^(follow|edit)=/.test(hash)) assert.deepEqual(await page.eval(() => [location.hash, window.__loaded]), ['', true]);
  }
  // a link not agreed to: cancelled, nothing saved, the project as it was (the dialog in Portuguese too)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await setHash(page, 'open=example:traffic');
  await page.waitDialog('Abrir a partir de uma Ligação');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .msg-text').textContent, [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent.trim())]),
    ['Esta ligação abre \'traffic\'. Os seus documentos abertos têm alterações ainda não guardadas: guardá-las e depois abri-la?', ['Guardar e Abrir', 'Cancelar']]);
  await page.dialogButton('Cancelar');
  await linkOpened(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await untouched();
  await setHash(page, 'open=example:traffic');
  await page.waitDialog('Open from a Link');
  await page.dialogButton('Cancel');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: cancelled\./);
  await untouched();
  assert.equal(await page.eval(() => window.Silinx.project.name), 'stopwatch');
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), ['ERROR: Open from a link: the link\'s design is not well encoded.',
    'ERROR: Open from a link: the link\'s open= is an address of this computer or of a local network (\'192.168.1.1\').', 'ERROR: Follow a shared project: the link to follow is broken (copy it again from the owner\'s Share Project).', 'ERROR: Follow a shared project: the link to follow is broken (copy it again from the owner\'s Share Project).']);
  assert.deepEqual(warnings(page), []);
});

// a shared project's link that is well formed (#3531): asked as a design's when a document has changes not saved yet
// (Cancel: nothing saved, the hash cleared); in the page that shares a project, the console's warning, nothing asked
// nor saved; agreed to, the work saved, then the page loaded again, which asks the follower's name
uiTest('#3531 a shared project\'s link: asked before the work is saved, nothing saved in the page that shares; agreed, saved, then the page loaded again', E, async (page) => {
  await boot(page, 'open=example:stopwatch');
  await linkOpened(page);
  await page.eval(() => window.SilinxApp.openFile('src/debounce.vhd'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/debounce.vhd' && window.Silinx.active.editor, [], { what: 'the VHDL open' });
  const disk = await readWs(env, 'stopwatch', 'src/debounce.vhd');
  await page.eval(() => {
    const d = window.Silinx.active, save = d.save.bind(d);
    window.__saves = 0;
    d.save = async (...a) => { window.__saves++; return save(...a); };
    d.editor.setValue(`-- to follow\n${d.editor.getValue()}`);
    clearTimeout(d._autosave);
  });
  const untouched = async () => {
    assert.equal(await page.eval(() => window.__saves), 0);
    assert.equal(await page.eval(() => window.Silinx.active.dirty), true);
    assert.equal(await readWs(env, 'stopwatch', 'src/debounce.vhd'), disk);
  };
  const link = `follow=${'r'.repeat(22)}.${'k'.repeat(43)}`;
  // (asked, in Portuguese too; Cancel: nothing saved, the hash cleared, the same page)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await setHash(page, link);
  await page.waitDialog('Seguir um Projeto Partilhado');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .msg-text').textContent, [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent.trim())]),
    ['Esta ligação segue um projeto que alguém partilha. Os seus documentos abertos têm alterações ainda não guardadas: guardá-las e depois segui-lo?', ['Guardar e Seguir', 'Cancelar']]);
  await page.dialogButton('Cancelar');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.waitConsole(/Follow a shared project: cancelled\./);
  await untouched();
  assert.deepEqual(await page.eval(() => [location.hash, window.__loaded]), ['', true]);
  // (the page that shares a project: the warning, nothing asked nor saved)
  await page.eval(async () => { (await import('/js/collab-state.js')).collab.role = 'owner'; });
  await setHash(page, link);
  await page.waitConsole(/WARNING: Follow a shared project: this page shares a project, which loading the link here would stop: open the link in another tab or window\./);
  assert.equal(await page.dialogCount(), 0);
  await untouched();
  assert.deepEqual(await page.eval(() => [location.hash, window.__loaded]), ['', true]);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), ['WARNING: Follow a shared project: this page shares a project, which loading the link here would stop: open the link in another tab or window.']);
  await page.eval(async () => { (await import('/js/collab-state.js')).collab.role = null; });
  // (agreed: saved, then the page loaded again, which asks the follower's name)
  await setHash(page, link);
  await page.waitDialog('Follow a Shared Project');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), 'This link follows a project someone shares. Your open documents have changes not saved yet: save them, then follow it?');
  await page.dialogButton('Save and Follow');
  // (the page loaded again asks the follower's name, its start-up waiting for the answer)
  await page.waitFor(() => !window.__loaded && document.querySelector('.dlg-overlay input[data-field="name"]'), [], { what: 'the page loaded again', timeout: 30000 });
  assert.match(await readWs(env, 'stopwatch', 'src/debounce.vhd'), /^-- to follow\n/);
  await page.dialogButton('Cancel');
  await page.waitFor(() => window.Silinx?.startupChecked, [], { what: 'the start-up', timeout: 30000 });
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
});

uiTest('#3316 a shared project\'s link given to the running app: a broken one said, the page not loaded again (#3531); an address\'s token left alone', E, async (page) => {
  await boot(page);
  await page.eval(() => { location.hash = 'token=evilEvil1'; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), null);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), []);
  await page.eval(() => { window.__loaded = true; location.hash = 'follow=broken'; });
  await page.waitConsole(/ERROR: Follow a shared project: the link to follow is broken \(copy it again from the owner's Share Project\)\./);
  assert.deepEqual(await page.eval(() => [location.hash, window.__loaded]), ['', true]);
  assert.deepEqual(await consoleLines(page, /^(WARNING|ERROR)/), ['ERROR: Follow a shared project: the link to follow is broken (copy it again from the owner\'s Share Project).']);
});
