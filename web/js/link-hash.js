// A link given to a Silinx already running (#3316): the address's hash changed (a link pasted or edited in the address
// bar, Back / Forward) without the page loading again. A design's link (#open=…, core/design-link.js) is opened as at
// start-up, through the same functions (link-open.js linkOptions, openFromLink: the same checks, size caps, the user's
// consent before a zip from elsewhere is fetched, the same refusals and messages); a shared project's link (#follow=,
// #edit=, collab-follow.js) and any link while a project is followed load the page again, which handles it at start-up
// (following replaces the workspace's api). The open documents are saved only once the link is read and agreed to
// (#3362: another page holding this window can change its hash): a design's link once it decodes (a zip's once the
// user agrees to fetch it), the user asked first when a document has changes not saved yet; a link that loads the page
// again, once it is read (#3531: a shared project's link parsed, asked as a design's; nothing in the page that
// shares), before the load. One that cannot be saved keeps the link from opening (the work is kept); a hash that is no
// link saves nothing. An address's token (#token=, #code=) is api.js's, at start-up only. The hash the app clears
// (history.replaceState) fires no hashchange: no loop.
import { api } from './api.js';
import { S, app } from './app.js';
import { confirmDlg } from './ui.js';
import { collab } from './collab-state.js';

const TOKEN = /^#(?:token|code)=/, FOLLOW = /^#(?:follow|edit)=/;
let queue = Promise.resolve();

/** Open the links the address's hash gives from now on (once, at the end of the start-up). */
export function watchLinks(target = window) {
  target.addEventListener('hashchange', () => { queue = queue.then(() => linkChanged()).catch(e => app.log(`ERROR: Open from a link: ${e.message}.`, 'err')); });
}

/** The address's hash now handled as a link (false: none, or not opened). Exported for tests. */
async function linkChanged(hash = location.hash) {
  if (hash.length <= 1 || TOKEN.test(hash)) return false;
  const what = FOLLOW.test(hash) ? 'Follow a shared project' : 'Open from a link';
  if (S.busy || S.currentJob) { app.log(`ERROR: ${what}: an implementation is running: stop it (or wait for it to finish), then open the link again.`, 'err'); return false; }
  // (a shared project's link: collab-follow.js followPasted, which loads the page again, but not in the page that shares
  // one, which the console warns about, #3318, #3331; read first, #3531: a broken one said, the hash cleared, and
  // nothing saved, nor in the page that shares; the work saved before the load, the user asked first as for a design)
  if (FOLLOW.test(hash)) {
    const [{ parseFollowLink }, { followPasted }] = await Promise.all([import('/core/collab-link.js'), import('./collab-follow.js')]);
    try { parseFollowLink(hash); } catch (e) { clearHash(); app.log(`ERROR: ${what}: ${e.message}.`, 'err'); return false; }
    if (collab.role === 'owner') { followPasted(); return false; }
    const go = await followAgreed(what);
    if (go === 'cancelled') { clearHash(); app.log(`${what}: cancelled.`, 'info'); }
    if (go !== true) return false;
    followPasted();
    return true;
  }
  // (any other link while a project is followed: the page loaded again, which opens it; a hash that is no link, or a
  // broken one, said and nothing saved, #3531)
  if (api.following) {
    const { parseLink } = await import('/core/design-link.js');
    let link;
    try { link = parseLink(hash); } catch (e) { app.log(`ERROR: ${what}: ${e.message}.`, 'err'); return false; }
    if (!link || !await saved(what)) return false;
    location.reload();
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
const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
// a shared project's link read: the user asked before the documents with changes not saved yet are saved, then saved ->
// true, false (not saved), or 'cancelled'
async function followAgreed(what) {
  if (S.docs.some(x => x.dirty)) {
    const yes = await confirmDlg('Follow a Shared Project', 'This link follows a project someone shares. Your open documents have changes not saved yet: save them, then follow it?', { yes: 'Save and Follow', no: 'Cancel' });
    if (!yes) return 'cancelled';
  }
  return saved(what);
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
