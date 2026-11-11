// A link given to a Silinx already running (#3316): the address's hash changed (a link pasted or edited in the address
// bar, Back / Forward) without the page loading again. A design's link (#open=…, core/design-link.js) is opened as at
// start-up, through the same functions (link-open.js linkOptions, openFromLink: the same checks, size caps, the user's
// consent before a zip from elsewhere is fetched, the same refusals and messages); a shared project's link (#follow=,
// #edit=, collab-follow.js) and any link while a project is followed load the page again, which handles it at start-up
// (following replaces the workspace's api). The open documents are saved only once the link is read and agreed to
// (#3362: another page holding this window can change its hash): a design's link once it decodes (a zip's once the
// user agrees to fetch it), the user asked first when a document has changes not saved yet; a link that loads the page
// again, before the load. One that cannot be saved keeps the link from opening (the work is kept); a hash that is no
// link saves nothing. An address's token (#token=, #code=) is api.js's, at start-up only. The hash the app clears
// (history.replaceState) fires no hashchange: no loop.
import { api } from './api.js';
import { S, app } from './app.js';
import { confirmDlg } from './ui.js';

const TOKEN = /^#(?:token|code)=/, FOLLOW = /^#(?:follow|edit)=/;
let queue = Promise.resolve();

/** Open the links the address's hash gives from now on (once, at the end of the start-up). */
export function watchLinks(target = window) {
  target.addEventListener('hashchange', () => { queue = queue.then(() => linkChanged()).catch(e => app.log(`ERROR: Open from a link: ${e.message}.`, 'err')); });
}

/** The address's hash now handled as a link (false: none, or not opened). Exported for tests. */
export async function linkChanged(hash = location.hash) {
  if (hash.length <= 1 || TOKEN.test(hash)) return false;
  const what = FOLLOW.test(hash) ? 'Follow a shared project' : 'Open from a link';
  if (S.busy || S.currentJob) { app.log(`ERROR: ${what}: an implementation is running: stop it (or wait for it to finish), then open the link again.`, 'err'); return false; }
  // (a shared project's link: collab-follow.js followPasted, which loads the page again, but not in the page that shares
  // one, which the console warns about, #3318, #3331; the work saved before the load)
  if (FOLLOW.test(hash) || api.following) {
    if (!await saved(what)) return false;
    if (FOLLOW.test(hash)) (await import('./collab-follow.js')).followPasted(); else location.reload();
    return true;
  }
  const { linkOptions, openFromLink } = await import('./link-open.js');
  const opts = linkOptions(hash);
  if (!opts) return false;   // (no link, or a broken one: said, nothing saved)
  S.linkOpened = false;
  try { return await openFromLink(opts, { prepare: d => agreed(d, opts.source, what) }); } finally { S.linkOpened = true; }   // (the UI tests wait for it)
}

// the student's work saved before anything is replaced or compared: a document that cannot be saved stops the link
async function saved(what) {
  await app.saveAll();
  const unsaved = S.docs.filter(d => d.dirty);
  if (unsaved.length) { app.log(`ERROR: ${what}: ${unsaved.map(d => d.path || d.title).join(', ')} could not be saved: the link was not opened; your changes are kept.`, 'err'); return false; }
  return true;
}
// a design's link read (d: link-open.js designOf's): the user asked before the documents with changes not saved yet are
// saved (a zip's link asked already, before its fetch), then saved -> true, false (not saved), or 'cancelled'
async function agreed(d, source, what) {
  if (source.kind !== 'url' && S.docs.some(x => x.dirty)) {
    const yes = await confirmDlg('Open from a Link', `This link opens '${d.name}'. Your open documents have changes not saved yet: save them, then open it?`, { yes: 'Save and Open', no: 'Cancel' });
    if (!yes) return 'cancelled';
  }
  return saved(what);
}
