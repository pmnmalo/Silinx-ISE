// A Petri net's state machine (#2696): its state space as an FSM diagram (core/petri-fsm.js), read-only, beside the net;
// opened from the FSM badge of the net's Design row (and its context menu), made again from the net each time (the
// net's editor's model when it is open, saved or not).
import { h } from './dom.js';
import { S, closeDoc, findDoc, openDoc } from './app.js';
import { api } from './api.js';
import { log } from './console.js';

export async function openPetriFsm(path) {
  const id = `pnfsm:${path}`;
  const old = findDoc(id);
  if (old) await closeDoc(old);
  const pj = S.project.name;
  let net;
  try { net = findDoc(`pn:${path}`)?.petriEditor?.getModel() || JSON.parse(await api.readFile(pj, path)); }
  catch (e) { log(`ERROR: Cannot open ${path}: ${e.message}`, 'err'); return null; }
  const { petriToFsm, MAX_FSM_STATES } = await import('/core/petri-fsm.js');
  const r = petriToFsm(net);
  if (!r.fsm) { log(`ERROR: The state machine of "${path}": ${r.error}`, 'err'); return null; }
  const { mountFsmEditor } = await import('./fsm-editor.js');
  if (S.project?.name !== pj) return null;   // another project opened meanwhile
  const name = `${path.split('/').pop().replace(/\.pn\.json$/i, '')}.fsm`;
  const { openPetri } = await import('./drawings.js');
  return openDoc({
    id, title: name, tooltip: `${name}, the state machine of ${path}`, icon: 'fsm',
    create(el, d) {
      const link = h('a', { onclick: () => openPetri(path) }, path.split('/').pop());
      const count = `${r.states} state${r.states === 1 ? '' : 's'}${r.truncated ? `, the first ${MAX_FSM_STATES}: the state space is larger` : ''}`;
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name),
        h('span', { class: `gen-banner read-only${r.truncated ? ' out-of-sync' : ''}` }, 'Read-only, the state space of the Petri net ', link, ` (${count})`));
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      d.petriFsm = mountFsmEditor(host, { model: r.fsm, readOnly: true });
      return { destroy: () => d.petriFsm.destroy?.() };
    },
  });
}
