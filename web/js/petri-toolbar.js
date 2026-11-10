// The Petri net editor's toolbar (#405: out of mountPetriEditor in web/js/petri-editor.js, #3218): the tools (select,
// place, transition, arc, inhibitor arc), Delete, the zoom, Check, Simulate, the ☰ Properties toggle, the ⋮ menu
// (Analysis, PNML export and import, through the import gate) and the link to its HDL; the status line of its counts.
import { h, downloadText } from './ui.js';
import { toolbarMenu } from './toolbar-menu.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { normalizePetri, toPnml, fromPnml } from '/core/petri.js';
import { GateError, gateFile, kindOf } from '/core/import-gate.js';
import { statusLine } from './status-line.js';

/** { tools, delBtn, checkBtn, tabBtns, pnmlIn, linkHost, zoomLbl, info, more, toolbar } of mountPetriEditor (M(): its
 *  current net, setM(m), setSel(v); the editor's actions, called when used). */
export function mountPetriToolbar(ctx) {
  const {
    opts, root, btn, sep, M, setM, setSel, setTool, deleteSelection, check, togglePanel, zoomBtn, fit, commit, status
  } = ctx;
  const tools = {
    select: toolIcon('select', 'select', 'Select and move (drag the background to pan, wheel to zoom)', () => setTool('select'), 'pn-tool'),
    place: btn([h('span', { class: 'pn-ico-place' }), 'Place'], 'Click the drawing to add a place', () => setTool('place'), 'pn-tool asm-wide'),
    transition: btn([h('span', { class: 'pn-ico-trans' }), 'Transition'], 'Click the drawing to add a transition', () => setTool('transition'), 'pn-tool asm-wide'),
    arc: toolWide('arc', 'Arc', 'Click a place then a transition (or a transition then a place)', () => setTool('arc'), 'pn-tool'),
    inhibitor: toolWide('inhibitor', 'Inhibitor', 'Click a place then a transition: the transition fires only while the place holds fewer tokens than the weight', () => setTool('inhibitor'), 'pn-tool'),
  };
  const delBtn = toolIcon('delete', 'del', 'Delete the selection (Del)', () => deleteSelection(), 'asm-danger');
  const checkBtn = toolWide('check', 'Check', 'Check the net for errors and warnings (its token game too: transitions that never fire, deadlocks)', () => opts.onCheck?.(check()), 'pn-check');
  const tabBtns = {
    sim: toolWide('sim', 'Simulate', 'Play the net: fire transitions, clock steps, run', () => togglePanel('sim'), 'pn-tab-btn'),
    analysis: btn('∑ Analysis', 'Reachable markings, bounds, deadlocks, liveness, invariants', () => togglePanel('analysis'), 'pn-tab-btn'),
  };
  const pnmlIn = h('input', { type: 'file', accept: '.pnml,.xml', hidden: true });
  pnmlIn.addEventListener('change', async () => {
    const f = pnmlIn.files[0]; pnmlIn.value = '';
    if (!f) return;
    // (through the import gate, #2830: no DTD, its size and nesting; its name only said, never part of a path)
    try {
      const g = gateFile(f.name.replace(/[^\w.-]/g, '_'), new Uint8Array(await f.arrayBuffer()));
      if (kindOf(g.path) !== 'xml') throw new Error(`${f.name}: not a PNML file (.pnml or .xml)`);
      const n = fromPnml(g.text, { name: M().name }); setM(normalizePetri({ ...n, lang: M().lang, generatedFile: M().generatedFile })); setSel(null); commit(); fit();
    } catch (e) { status(`PNML: ${e instanceof GateError ? `${f.name}: ${e.reason}` : e.message}`, true); }
  });
  const linkHost = h('span', { class: 'pn-link' });
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const info = statusLine();   // (the net's counts and its tokens: in its status line, #2763)
  const more = toolbarMenu([tabBtns.analysis,
    btn('PNML ⇩', 'Export the net as PNML (for PIPE, WoPeD, TINA…)', () => downloadText(`${M().name}.pnml`, toPnml(M()), 'application/xml')),
    btn('PNML ⇧', 'Import a PNML net (replaces this one: Undo brings it back)', () => pnmlIn.click(), 'pn-pnml-in'),
  ], { title: 'Analysis and PNML', btnClass: 'asm-btn' });
  const toolbar = h('div', { class: 'asm-toolbar pn-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools)), sep(),
    h('div', { class: 'asm-group' }, delBtn), sep(),
    h('div', { class: 'asm-group' }, ...zoomTools((f) => zoomBtn(f), () => fit()), zoomLbl), sep(),
    h('div', { class: 'asm-group' }, checkBtn), sep(),
    h('div', { class: 'asm-group' }, tabBtns.sim, pnmlIn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })),
    more.el, linkHost);
  return { tools, delBtn, checkBtn, tabBtns, pnmlIn, linkHost, zoomLbl, info, more, toolbar };
}
