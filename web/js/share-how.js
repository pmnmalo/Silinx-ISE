// Share Project… and Share Module… (#3698): one action, the way of sharing chosen in its window, its first row (Share:):
// a copy (web/js/link-copy.js: a link with the project in it) or live (web/js/collab-share.js: others follow it as it
// changes). Switching closes the window and opens the other way's in its place; the way last chosen is kept per viewer
// (the copy by default). Live is disabled, its reason its tip, where the project cannot be shared live.
import { api } from './api.js';
import { h } from './ui.js';
import { S } from './app.js';
import { prefKey } from './prefs.js';

const HOW_KEY = prefKey('silinx.share-how');
const HOWS = Object.freeze(['copy', 'live']);

/** The window's title, and its console messages' name: Share Project, or Share Module (a module's). */
export const shareTitle = module => (module ? 'Share Module' : 'Share Project');

/** Why the project (`module`: one of its modules) cannot be shared live here, or null. */
function liveProblem(module = null) {
  if (!api.collab && !api.standalone) return 'This edition of Silinx does not share a project live.';
  if (location.protocol === 'file:') return 'A Silinx opened from a file has no address that others can open: open Silinx from its site to share a project live.';
  if (api.following) return 'You are following another\'s project: stop following it to share one live.';
  if (module && (S.modules || []).some(m => m.name === module && m.role === 'sim')) return 'A test bench is shared as a copy only.';
  return null;
}

const savedHow = () => { try { return HOWS.includes(localStorage.getItem(HOW_KEY)) ? localStorage.getItem(HOW_KEY) : 'copy'; } catch { return 'copy'; } };
const keepHow = how => { try { localStorage.setItem(HOW_KEY, how); } catch { /* this page only */ } };

/** Share Project… (no `module`) or Share Module… (`module`, and the copy's `view`): the window of the way last
 *  chosen, the copy when live is not possible here. */
export async function shareDialog({ module = null, view = null } = {}) {
  if (!S.project) return null;
  return openHow(savedHow() === 'live' && !liveProblem(module) ? 'live' : 'copy', { module, view });
}

async function openHow(how, opts) {
  if (how === 'live') return (await import('./collab-share.js')).shareProjectDialog(opts);
  return (await import('./link-copy.js')).copyLinkDialog(opts);
}

/** The window's Share: row, `how` checked: the other way chosen closes the window (`close`), whose caller then sees
 *  `wanted` and calls `switched()`, the other way's window, its way kept as the viewer's. Returns { el, wanted,
 *  switched }. */
export function howRow(how, { module = null, view = null, close }) {
  let wanted = null;
  const live = liveProblem(module);
  const radio = (value, label) => {
    const r = h('input', { type: 'radio', name: 'share-how', value, 'data-field': `how-${value}`, checked: value === how, disabled: value === 'live' && !!live });
    r.addEventListener('change', () => { if (r.checked && value !== how) { wanted = value; close(); } });
    return h('label', { class: `share-how-${value}`, title: value === 'live' && live ? live : '' }, r, h('span', {}, label));
  };
  const el = h('div', { class: 'share-how' },
    h('label', {}, 'Share:'),
    h('div', { class: 'share-how-choices' },
      radio('copy', 'A copy: a link with the project in it'), h('br'),
      radio('live', 'Live: others follow it as you work')));
  return {
    el,
    get wanted() { return wanted; },
    switched: () => { keepHow(wanted); return openHow(wanted, { module, view }); },
  };
}
