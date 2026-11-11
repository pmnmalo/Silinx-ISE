// A shared project's state in the page (#3181), read by the editors without importing the sharing itself: whether this
// page shares its project (the owner) or follows another's (a follower, read only; an editor, its text files too,
// #3182, its drawings edited live too, #3183), and the follower's notice.
import { h } from './dom.js';
import { editablePath } from '/core/collab-doc.js';
import { liveDrawing } from '/core/collab-kinds.js';

export const collab = {
  role: null,      // 'owner' | 'follower' | null
  owner: '',       // the owner's name (a follower's)
  project: null,   // the project shared or followed
  session: null,   // core/collab-client.js's room
  editor: false,   // (a follower whose link edits the project's text files, #3182)
};
export const following = () => collab.role === 'follower';
export const sharing = () => collab.role === 'owner';
/** Whether this page edits a file of the project it follows (an editor's link, a text file: its editor bound live). */
export const editsHere = path => following() && collab.editor && editablePath(path);
/** Whether this page edits a drawing of the project it follows (an editor's link, a drawing edited live, #3183: its
 *  editor bound to the drawing's structure, collab-drawing.js). */
export const editsDrawingHere = path => following() && collab.editor && liveDrawing(path);

/** A follower's read-only notice, for the right end of an editor's toolbar (docs/UI-GUIDELINES.md); null otherwise (or
 *  for a file this page edits). */
export const followNotice = (path = null) => (following() && !(path && (editsHere(path) || editsDrawingHere(path)))
  ? h('span', { class: 'gen-banner read-only', 'data-follow-notice': '' }, `Read-only, following ${collab.owner}'s project`)
  : null);

/** The error of a change a follower's page refuses. */
export const readOnlyError = () => Object.assign(new Error(`read only: you follow ${collab.owner}'s project (its owner edits it)`), { status: 403, readOnly: true });
