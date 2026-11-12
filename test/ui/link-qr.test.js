// UI: the QR code of the sharing dialogs' links (#3637, web/js/link-qr.js, core/qr.js): Share Project…'s full link
// (decoded back: the link shown), enlarged in a dialog of its own; the short link's (#3223) once Show QR Code makes it,
// the one Copy Link then copies (no second gist); a link too long for a QR code (an example's full link): none, a line
// in the console suggesting the short link (information: the dialog's default, no warning); the labels in Portuguese (Share Project
// Live…'s: link-qr-live.test.js). Both interfaces; the exact warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { decodeSvg } from '../qr-helpers.js';
import { QR_MAX_BYTES } from '../../core/qr.js';

let env;
const TOKEN = 'gho_faketokenofthetests0123456789';   // (test/fake-github.mjs's)
before(async () => {
  Object.assign(process.env, { SILINX_UI_GITHUB: '1', GH_TOKEN: TOKEN });
  env = await setupUi();
});
after(async () => { await env?.teardown?.(); delete process.env.SILINX_UI_GITHUB; delete process.env.GH_TOKEN; });
const E = () => env;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO)/.test(l.trim())).map((l) => l.trim());
const fakeApi = (page) => page.eval(() => { window.SILINX_GITHUB = { api: `${location.origin}/fake-github` }; });
const startCopy = (page) => page.eval(() => { window.__copied = import('/js/link-copy.js').then((m) => m.copyLinkDialog()); });
const copied = (page) => page.eval(() => window.__copied);
// (an empty project's full link fits a QR code; an example's is longer)
const make = (page, name, template = null) => page.eval(async (n, t) => { const { api } = await import('/js/api.js'); await api.createProject({ name: n, ...(t ? { template: t } : {}) }); }, name, template);
// the text of the QR image in a dialog (its SVG decoded back), and its width on the screen
const qrOf = async (page, sel) => {
  const r = await page.eval((s) => { const i = [...document.querySelectorAll(s)].pop(); return i ? { src: i.getAttribute('src'), width: i.getBoundingClientRect().width } : null; }, sel);
  return r && { text: decodeSvg(decodeURIComponent(r.src.replace(/^data:image\/svg\+xml,/, ''))), width: r.width };
};
const gists = (page) => page.eval(async (t) => (await (await fetch('/fake-github/gists', { headers: { Authorization: `Bearer ${t}` } })).json()).length, TOKEN);

uiTest('#3637 Share Project: the full link\'s QR code, enlarged; the short link\'s, made by Show QR Code, the one copied', E, async (page) => {
  await fakeApi(page);
  await make(page, 'qrlamp');
  await page.openProject('qrlamp');
  await startCopy(page);
  await page.waitDialog('Share Project');
  const link = await page.eval(() => document.querySelector('.dlg-overlay .link-out').value);
  assert.ok(link.length <= QR_MAX_BYTES, `${link.length}`);
  const small = await qrOf(page, '.dlg-overlay .qr-box .qr-img');
  assert.equal(small.text, link);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .qr-show').title), 'Enlarge the QR code, for a projector');
  // enlarged (Enlarge, or a click on it): a dialog of its own, over the other
  await page.click('.dlg-overlay .qr-enlarge');
  await page.waitDialog('QR Code');
  const large = await qrOf(page, '.dlg-overlay .qr-large-img');
  assert.equal(large.text, link);
  assert.ok(large.width > 2.5 * small.width, `${large.width} vs ${small.width}`);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay:last-child .qr-large-link')?.textContent ?? [...document.querySelectorAll('.qr-large-link')].pop().textContent), link);
  await page.dialogButton('Close');
  await page.waitDialog('Share Project');
  await page.click('.dlg-overlay .qr-show');
  await page.waitDialog('QR Code');
  await page.dialogButton('Close');
  await page.waitDialog('Share Project');
  // another link (the current view left out): the QR follows the link shown
  await page.click('.dlg-overlay input[data-field="ui"]');
  const bare = await page.eval(() => document.querySelector('.dlg-overlay .link-out').value);
  assert.notEqual(bare, link);
  assert.equal((await qrOf(page, '.dlg-overlay .qr-box .qr-img')).text, bare);
  // the short link: no QR until it is made; Show QR Code makes it, shows it and its QR enlarged
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.equal(await qrOf(page, '.dlg-overlay .qr-box .qr-img'), null);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .qr-make').textContent), 'Show QR Code');
  const before = await gists(page);
  await page.click('.dlg-overlay .qr-make');
  await page.waitDialog('QR Code');
  const shortLink = await page.eval(() => document.querySelector('.dlg-overlay .link-out').value);
  assert.match(shortLink, /#gist=[0-9a-f]{32}\.[A-Za-z0-9_-]{43}/);
  assert.equal((await qrOf(page, '.dlg-overlay .qr-large-img')).text, shortLink);
  await page.dialogButton('Close');
  await page.waitDialog('Share Project');
  assert.equal((await qrOf(page, '.dlg-overlay .qr-box .qr-img')).text, shortLink);
  // Copy Link copies that one: no second gist
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  assert.equal(await copied(page), shortLink);
  assert.equal(await gists(page), before + 1);
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3637 Share Project: a link too long for a QR code: none, a line in the console suggesting the short link', E, async (page) => {
  await make(page, 'qrbig', 'gates');
  await page.openProject('qrbig');
  await startCopy(page);
  await page.waitDialog('Share Project');
  const n = await page.eval(() => document.querySelector('.dlg-overlay .link-out').value.length);
  assert.ok(n > QR_MAX_BYTES, `${n}`);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .qr-box').children.length), 0);
  const said = `Share Project: the link of 'qrbig' is ${n} characters, too long for a QR code (at most ${QR_MAX_BYTES}): the short link has one.`;
  await page.waitConsole(new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // (said once: the link made again, the same)
  await page.click('.dlg-overlay input[data-field="ui"]');
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .qr-make')?.textContent), 'Show QR Code');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal((await page.consoleText()).split('\n').filter((l) => l.includes('too long for a QR code')).length, 1);
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3637 the QR code\'s labels in Portuguese', E, async (page) => {
  await make(page, 'qrluz');
  await page.openProject('qrluz');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await startCopy(page);
  await page.waitDialog('Partilhar Projeto');
  assert.deepEqual(await page.eval(() => { const b = document.querySelector('.dlg-overlay .qr-show'); return [b.title, b.querySelector('img').getAttribute('aria-label'), document.querySelector('.dlg-overlay .qr-enlarge').textContent]; }),
    ['Ampliar o código QR, para um projetor', 'Código QR da ligação', 'Ampliar']);
  await page.click('.dlg-overlay .qr-enlarge');
  await page.waitDialog('Código QR');
  await page.dialogButton('Fechar');
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .qr-make').textContent), 'Mostrar o Código QR');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await warnings(page), []);
});
