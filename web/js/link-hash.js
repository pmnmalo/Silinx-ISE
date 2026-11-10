// A link given to a Silinx already running (#3316): the address's hash changed (a link pasted or edited in the address
// bar, Back / Forward) without the page loading again. A design's link (#open=…, core/design-link.js) is opened as at
// start-up, through the same functions (link-open.js linkOptions, openFromLink: the same checks, size caps, the user's
// consent before a zip from elsewhere is fetched, the same refusals and messages); a shared project's link (#follow=,
// #edit=, collab-follow.js) and any link while a project is followed load the page again, which handles it at start-up
// (following replaces the workspace's api). The open documents are saved first; one that cannot be saved keeps the
// link from opening (the work is kept). An address's token (#token=, #code=) is api.js's, at start-up only. The hash
// the app clears (history.replaceState) fires no hashchange: no loop.
import { api } from './api.js';
import { S, app } from './app.js';

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
  // (the student's work saved before anything is replaced or compared: a document that cannot be saved stops here)
  await app.saveAll();
  const unsaved = S.docs.filter(d => d.dirty);
  if (unsaved.length) { app.log(`ERROR: ${what}: ${unsaved.map(d => d.path || d.title).join(', ')} could not be saved: the link was not opened; your changes are kept.`, 'err'); return false; }
  // (a shared project's link: collab-follow.js followPasted, which loads the page again, but not in the page that shares
  // one, which the console warns about, #3318, #3331)
  if (FOLLOW.test(hash)) { (await import('./collab-follow.js')).followPasted(); return true; }
  if (api.following) { location.reload(); return true; }
  const { linkOptions, openFromLink } = await import('./link-open.js');
  const opts = linkOptions(hash);
  if (!opts) return false;
  S.linkOpened = false;
  try { return await openFromLink(opts); } finally { S.linkOpened = true; }   // (the UI tests wait for it)
}
