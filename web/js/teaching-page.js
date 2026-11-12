// The Teaching page (#3533): a tab of the Design pane's row (Start, Design, Files, Libraries, Teaching), in both
// interfaces, gathering the tools of a class: the guided labs (#3179) and the exercises (#3192), as the Project menu
// has them; a project's link (#2826), a GitHub repository (a Classroom assignment's, #3195) and the live sharing
// (#3315), as the File menu has them. The same functions as the menus'; the Start page's Teaching box (#3333) gave
// way to it.
import { api } from './api.js';
import { icon } from './icons.js';
import { h } from './ui.js';
import { S } from './app.js';
import { hasGit, openFromRepositoryDialog } from './git.js';

/** Draws the Teaching page (#teach-page); a project's commands disabled with none, by the host's data-project
 *  (web/css/app.css), as the Start page's exports. */
export function renderTeachingPage() {
  const host = document.getElementById('teach-page');
  if (!host) return;
  const command = ([l, ic, f, pj, cls]) => h('div', { class: `entry${pj ? ' start-export' : ''}${cls ? ` ${cls}` : ''}` }, icon(ic), h('a', { onclick: f }, l));
  const page = h('div', { class: 'page' },
    h('div', { class: 'start-box teach-labs' }, h('h3', {}, 'Labs and Exercises'),
      ...[['Guided Labs…', 'help', () => S.project && import('./lab-view.js').then(m => m.guidedLabsDialog()), true],
        ['Exercise…', 'run', () => S.project && import('./exercise-view.js').then(m => m.exerciseDialog()), true]].map(command)),
    h('div', { class: 'start-box teach-share' }, h('h3', {}, 'Links and Sharing'),
      command(['Share Project Copy…', 'save', () => S.project && import('./link-copy.js').then(m => m.copyLinkDialog()), true]),
      // (the server editions, #3195; the editions that share, not while following another's, #3315)
      ...(hasGit() ? [command(['Open from Repository…', 'open', () => openFromRepositoryDialog()])] : []),
      ...((api.collab || api.standalone) && !api.following ? [command(['Share Project Live…', 'save', () => S.project && import('./collab-share.js').then(m => m.shareProjectDialog()), true])] : [])));
  if (S.project) host.dataset.project = ''; else delete host.dataset.project;
  // kept when it is the same (a click between a press and its release, as the Start page's, #494)
  if (host.firstElementChild?.outerHTML === page.outerHTML) return;
  host.replaceChildren(page);
}
