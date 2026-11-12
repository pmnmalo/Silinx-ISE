// UI: the QR code of Share Project…'s follow link (#3637, web/js/link-qr.js; #3181), and Share Module…'s
// (#3631, opening on the module): drawn beside the link
// (decoded back: the link), enlarged in a dialog of its own, for a projector. A server with its relay (no GitHub
// stand-in: link-qr.test.js's has none). Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { decodeSvg } from '../qr-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO)/.test(l.trim())).map((l) => l.trim());
const make = (page, name, template) => page.eval(async (n, t) => { const { api } = await import('/js/api.js'); await api.createProject({ name: n, template: t }); }, name, template);
// the text of the QR image in the top dialog (its SVG decoded back), and its width on the screen
const qrOf = async (page, sel) => {
  const r = await page.eval((s) => { const i = [...document.querySelectorAll(s)].pop(); return i ? { src: i.getAttribute('src'), width: i.getBoundingClientRect().width } : null; }, sel);
  return r && { text: decodeSvg(decodeURIComponent(r.src.replace(/^data:image\/svg\+xml,/, ''))), width: r.width };
};

uiTest('#3637 Share Project and Share Module: the follow link\'s QR code, enlarged', E, async (page) => {
  await make(page, 'qrlive', 'gates');
  await page.openProject('qrlive');
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
  await page.waitDialog('Share Project');
  await page.fill('.dlg-overlay input[data-field=name]', 'Teacher');
  await page.dialogButton('Share');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
  assert.match(link, /#follow=/);
  const small = await qrOf(page, '.dlg-overlay .qr-box .qr-img');
  assert.equal(small.text, link);
  await page.click('.dlg-overlay .qr-show');
  await page.waitDialog('QR Code');
  const large = await qrOf(page, '.dlg-overlay .qr-large-img');
  assert.equal(large.text, link);
  assert.ok(large.width > 2.5 * small.width, `${large.width} vs ${small.width}`);
  await page.dialogButton('Close');
  await page.waitDialog('Share Project');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // Share Module… (#3631): its link, opening on the module, its QR code
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog({ module: 'gates' })); });
  await page.waitDialog('Share Module');
  const mod = await page.eval(() => document.querySelector('.dlg-overlay input[data-field=link]').value);
  assert.equal(mod, `${link}&top=gates`);
  assert.equal((await qrOf(page, '.dlg-overlay .qr-box .qr-img')).text, mod);
  await page.click('.dlg-overlay .qr-enlarge');
  await page.waitDialog('QR Code');
  assert.equal((await qrOf(page, '.dlg-overlay .qr-large-img')).text, mod);
  await page.dialogButton('Close');
  await page.waitDialog('Share Module');
  await page.dialogButton('Stop Sharing');
  await page.waitNoDialog();
  await page.waitConsole(/Stopped sharing "qrlive"/);
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });
