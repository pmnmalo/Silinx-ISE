// An I/O marker of the schematic editor added or renamed with the name of a net (#2170): joined to that net only when
// the user says so, the marker then taking the net's width (core/schmarker.js); asked by the Add I/O Marker tool
// (sch-tools.js), the Properties panel (sch-props.js) and Rename… (sch-rename.js).
import { markerJoin } from '/core/schmarker.js';
import { dialog } from './ui.js';
import { h } from './dom.js';

/** { joinMarker } of mountSchEditor (doc(), nl(): its current ones). joinMarker(name, net): the join
 *  ({ net, name, width }), false (not joined: not that name), or null (no other net of that name). */
export function mountSchJoin(ctx) {
  const { doc, nl, container } = ctx;

  async function joinMarker(name, net) {
    if (!name || !nl()) return null;
    const j = markerJoin(doc(), nl(), name, net);
    if (!j) return null;
    const ok = await dialog({
      title: 'Net name already used', width: 460,
      body: h('div', { class: 'se-join' }, h('div', { text: `A net is already named '${j.name}'.` }),
        h('div', { text: 'Join this I/O marker to it? The marker takes the width of the net.' })),
      buttons: [{ label: 'Join', value: true, primary: true }, { label: 'Choose another name', value: null }],
    });
    container.focus({ preventScroll: true });
    return ok ? j : false;
  }

  return { joinMarker };
}
