// A shared project's state in the page (#3181), read by the editors without importing the sharing itself: whether this
// page shares its project (the owner) or follows another's (a follower, read only), and the follower's notice.
import { h } from './dom.js';

export const collab = {
  role: null,      // 'owner' | 'follower' | null
  owner: '',       // the owner's name (a follower's)
  project: null,   // the project shared or followed
  session: null,   // core/collab-client.js's room
};
export const following = () => collab.role === 'follower';
export const sharing = () => collab.role === 'owner';

/** A follower's read-only notice, for the right end of an editor's toolbar (docs/UI-GUIDELINES.md); null otherwise. */
export const followNotice = () => (following()
  ? h('span', { class: 'gen-banner read-only', 'data-follow-notice': '' }, `Read-only, following ${collab.owner}'s project`)
  : null);

/** The follower's notice put at the right end of a drawing editor's toolbar that takes none (the truth table's, the
 *  Petri net's: before its ⋮ menu); their edits are not kept (web/js/app.js setDirty), their read-only mode is #3181's
 *  next step. */
export function placeFollowNotice(root) {
  const bar = following() && root.querySelector('.tt-toolbar, .pn-toolbar');
  if (!bar) return;
  const more = [...bar.children].find(e => e.classList.contains('tb-more'));
  bar.insertBefore(followNotice(), more || null);
}

/** The error of a change a follower's page refuses. */
export const readOnlyError = () => Object.assign(new Error(`read only: you follow ${collab.owner}'s project (its owner edits it)`), { status: 403, readOnly: true });
