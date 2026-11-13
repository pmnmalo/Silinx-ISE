// I/O Pin Planning: assign top-level ports to package pins / board resources and write the UCF.
// The look of the diagram editors (#2671, asm-editor.css): their toolbar, and their side panel for the board's resources,
// folded to a strip (side-fold.js), its groups folded each, over the table on a narrow window (narrow.js).
// Two views (#2694): the table, and the board as the Board Emulator draws it (pinplanner-board.js), the ports dragged
// from the Ports panel on its left (pinplanner-ports.js, #2715) onto its parts or onto the rows of Board Resources.
import { constraintsExt, readPins, writePins } from './constraints-format.js';
import { pinAttrsOf } from '/core/constraints-check.js';
import { toolWide } from './editor-icons.js';
import { mountSideFold } from './side-fold.js';
import { mountPinBoard } from './pinplanner-board.js';
import { mountPinPorts } from './pinplanner-ports.js';
import { panelToggle, PORTS_KEY, RESOURCES_KEY } from './narrow.js';
import { api } from './api.js';
import { icons } from './icons.js';
import { h, toast, confirmDlg, popupMenu } from './ui.js';
import { bitName, boardAutoAssign } from '/packages/silinx-fpga/src/parts.js';
import { elaborate } from '/core/compile.js';
import { boardRemove } from '/core/pin-board.js';
import { S, app, setDirty } from './app.js';
import { statusLine } from './status-line.js';
import { logError, logWarning } from './console.js';

export function mountPinPlanner(el, doc, top) {
  const pj = S.project;
  const db = S.devices;
  const board = app.projectBoard(pj);
  const root = h('div', { class: 'asm-editor pin-planner' });
  el.append(root);

  // ports of the top module (elaborated to get real widths)
  const design = elaborate(S.lib, top);
  // a top the project does not have (its source removed), or one that does not elaborate: said so,
  // not an empty table (#253)
  if (!design.top) {
    const err = (design.diags || []).find(d => d.severity === 'error');
    const known = S.modules?.some(m => m.name.toLowerCase() === String(top).toLowerCase());
    root.append(h('div', { class: 'pp-missing' },
      h('p', {}, known ? `The ports of the top-level module '${top}' cannot be read: ${err?.message || 'it does not elaborate'}.` : `The top-level module '${top}' is not in the project.`),
      h('p', {}, known ? 'Correct its errors (Check Syntax), then open I/O Pin Planning again.' : 'Set the top module (a module\'s right-click menu: Set as Top Module), then open I/O Pin Planning again.')));
    doc.pinPlanner = { undo: () => {}, redo: () => {}, canUndo: () => false, canRedo: () => false };
    return { save: () => {} };
  }
  const ports = (design.top?.ports || []).map(p => {
    const t = p.sig.t;
    const bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);   // a 1-bit vector is x<0> in the UCF
    return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null, bus };
  });
  const nets = [];
  for (const p of ports) {
    if (!p.bus) nets.push({ net: bitName(p.name), port: p, bit: null });
    else {
      const step = p.msb >= p.lsb ? -1 : 1;
      for (let i = p.lsb; ; i -= step) { nets.push({ net: bitName(p.name, i), port: p, bit: i }); if (i === p.msb) break; }
    }
  }
  // board resources -> pins
  const resPins = [];
  for (const r of board?.resources || []) r.pins.forEach((pin, i) => resPins.push({ res: r, pin, label: r.pins.length > 1 ? `${r.name}<${i}>` : r.name, idx: i }));
  const famId = db?.parts?.find(p => p.part === pj.device.part)?.family || pj.device.family;
  // (the attributes the device's format writes, #2296: a PCF's pull-up only; an LPF's and a CST's own I/O standards, drives…)
  const can = pinAttrsOf(pj.device);
  const iostds = Array.isArray(can.iostandard) ? can.iostandard : can.iostandard ? db?.families?.find(f => f.id === famId)?.ioStandards || db?.iostandards || ['LVCMOS33', 'LVCMOS25', 'LVTTL'] : [];

  let asg = {}, clocks = [], other = [];
  // Undo / Redo of the assignments (Edit menu, Ctrl+Z / Ctrl+Y on the page)
  const hist = [];
  let hi = -1;
  const snap = () => { const t = JSON.stringify({ asg, clocks }); if (t === hist[hi]) return; hist.length = hi + 1; hist.push(t); if (hist.length > 200) hist.shift(); hi = hist.length - 1; };
  const restore = i => { hi = i; ({ asg, clocks } = JSON.parse(hist[hi])); render(); setDirty(doc, true); };
  const changed = () => { snap(); setDirty(doc, true); };
  doc.pinPlanner = {
    undo: () => { if (hi > 0) restore(hi - 1); }, redo: () => { if (hi < hist.length - 1) restore(hi + 1); },
    canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
  };
  root.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); doc.pinPlanner.undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); doc.pinPlanner.redo(); }
  });
  const load = async () => {
    if (pj.constraints && S.fileTree.includes(pj.constraints)) {
      try {
        // the bits of the buses written x[1] or x(1) become x<1>; any other name stays as written (#63)
        const u = readPins(pj.device, await api.readFile(pj.name, pj.constraints), { ports });
        asg = u.assignments || {}; clocks = u.clocks || []; other = u.other || [];
      } catch (e) { logError(`cannot parse ${pj.constraints}: ${e.message}`); }
    }
    snap();
    render();
  };

  const tableHost = h('div', { class: 'pp-table' });
  const boardHost = h('div', { class: 'pp-board', hidden: true });
  // the board's view: the ports on its left (folded to a strip, remembered), dragged onto it
  const portsList = h('div', { class: 'pp-portlist' });
  const portsSide = h('aside', { class: 'pp-ports-side', hidden: true }, h('div', { class: 'asm-cap' }, 'Ports'), portsList);
  const portsView = board && mountPinPorts({ list: portsList, root, board, ports, assignments: () => asg, drop: boardDrop, remove: removeNets });
  // the view shown: the table or the board (its drawing loaded the first time: the emulator's module)
  let view = 'table', boardView = null;
  const viewBtn = (id, label, title) => h('button', { type: 'button', class: 'asm-btn asm-wide pp-view', 'data-view': id, title, onclick: () => setView(id) }, label);
  const viewBtns = [viewBtn('table', 'Table', 'The assignments as a table'), viewBtn('board', 'Board', board ? 'Drag the ports onto the parts of the board' : 'Select a board in Design Properties')];
  viewBtns[1].disabled = !board;
  async function setView(id) {
    if (id === 'board' && !boardView) {
      const emulator = await import('./emulator.js');
      boardView = mountPinBoard({ host: boardHost, board, title: top, assignments: () => asg, pinMenu, emulator });
    }
    view = id;
    render();
  }
  // a port or a bit dropped on the board: its pins, undoable; what it placed, took and warns of in the console
  function boardDrop(r) {
    for (const [net, a] of Object.entries(r.changes)) asg[net] = { ...(asg[net] || {}), ...a };
    clocks = clocks.filter(c => !r.clocks.some(x => x.net === c.net)).concat(r.clocks);
    changed();
    render();
    if (r.placed.length) app.log(`I/O Pin Planning: ${r.placed.map(([n, l]) => `${n} → ${l}`).join(', ')}.`, 'ok');
    for (const n of r.notes) app.log(`I/O Pin Planning: ${n}.`, 'info');
    for (const w of r.warnings) app.log(`I/O Pin Planning: ${w}.`, 'warn');
  }
  // bits taken off their pins (a ✕ of the Ports panel, a pin's menu), undoable
  function removeNets(list) {
    const r = boardRemove({ nets: list, assignments: asg, board });
    if (!r.removed.length) return;
    for (const [net, a] of Object.entries(r.changes)) asg[net] = { ...(asg[net] || {}), ...a };
    clocks = clocks.filter(c => !(c.net in r.changes));
    changed();
    render();
    app.log(`I/O Pin Planning: removed from their pins: ${r.removed.map(([n, l]) => `${n} (${l})`).join(', ')}.`, 'info');
  }
  // the right-click menu of a pin (a part of the board, a row of Board Resources) with bits on it
  function pinMenu(e, pin) {
    const on = used().get(String(pin).toUpperCase());
    if (!on) return;
    e.preventDefault();
    popupMenu(on.map(n => ({ label: `Remove ${n} from its pin`, action: () => removeNets([n]) })), e.clientX, e.clientY);
  }
  const resHost = h('div', { class: 'pp-res' });
  // (its status line, #2763: the ports assigned, the top, the device, the board)
  const line = statusLine();
  const setStatus = (t) => { line.set([{ text: t, cls: 'pp-status' }, { text: `Top: ${top}`, cls: 'pp-info' }, `Device ${pj.device.part}-${pj.device.package}`, board ? `Board: ${board.name}` : 'no board selected']); };
  const sep = () => h('span', { class: 'asm-sep' });
  const autoBtn = toolWide('beautify', 'Auto-assign from Board', board ? 'Match port names with board resources (clk, led, sw, btn, seg, an…)' : 'Select a board in Design Properties', () => autoAssign());
  autoBtn.disabled = !board;
  const portsBtn = panelToggle(root, h('button', { type: 'button', class: 'asm-btn asm-wide', title: 'Show / hide the ports panel' }, '☰ Ports'), { cls: 'ports-open', key: PORTS_KEY });
  const bar = h('div', { class: 'asm-toolbar pp-bar' },
    h('div', { class: 'asm-group' }, ...viewBtns),
    sep(),
    h('div', { class: 'asm-group' }, autoBtn, toolWide('del', 'Clear All', 'Remove every pin assignment', () => { asg = {}; clocks = []; render(); changed(); })),
    h('div', { class: 'asm-spacer' }),
    // (a narrow window: the ports and the board's resources over the board and the table, shown by these)
    h('div', { class: 'asm-group' }, portsBtn, panelToggle(root, h('button', { type: 'button', class: 'asm-btn asm-wide', title: 'Show / hide the board resources panel' }, '☰ Board Resources'), { key: RESOURCES_KEY })));
  const side = h('aside', { class: 'asm-side pp-side' }, h('div', { class: 'asm-cap' }, 'Board Resources'), resHost);
  root.append(bar, h('div', { class: 'asm-body' }, portsSide, h('div', { class: 'asm-main' }, tableHost, boardHost), side), line.el);
  mountSideFold({ root, side, key: 'silinx.pins.props.folded', titles: { fold: 'Collapse the Board Resources panel', unfold: 'Expand the Board Resources panel' } });
  mountSideFold({ root, side: portsSide, key: 'silinx.pins.ports.folded', titles: { fold: 'Collapse the Ports panel', unfold: 'Expand the Ports panel' }, cls: 'ports-folded', toward: 'left' });
  const closedGroups = new Set();   // (the groups folded, kept when the panel is drawn again: render)

  function used() {
    const m = new Map();
    for (const [n, a] of Object.entries(asg)) if (a.loc) { const k = a.loc.toUpperCase(); m.set(k, [...(m.get(k) || []), n]); }
    return m;
  }

  function render() {
    const u = used();
    tableHost.hidden = view !== 'table'; boardHost.hidden = view !== 'board'; portsSide.hidden = view !== 'board'; portsBtn.style.display = view === 'board' ? '' : 'none';
    for (const b of viewBtns) { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-pressed', String(b.dataset.view === view)); }
    if (view === 'board') { boardView.render(); portsView.render(); }
    tableHost.innerHTML = '';
    const tbl = h('table', { class: 'grid' }, h('tr', {}, ...['I/O Name', 'Direction', 'Board Resource', 'Site (LOC)', 'I/O Std.', 'Drive', 'Slew', 'Pull', 'Clock period (ns)'].map(t => h('th', {}, t))));
    for (const n of nets) {
      const a = asg[n.net] || {};
      const set = (k, v) => { asg[n.net] = { ...(asg[n.net] || {}), [k]: v || undefined }; changed(); };
      const loc = h('input', { type: 'text', value: a.loc || '', list: 'pp-pins', style: { textTransform: 'uppercase' } });
      loc.addEventListener('change', () => { set('loc', loc.value.trim().toUpperCase()); render(); });
      const resSel = h('select', {}, h('option', { value: '' }, '—'), ...resPins.map(r => h('option', { value: r.pin, selected: a.loc && r.pin === a.loc.toUpperCase() }, `${r.label} (${r.pin})`)));
      resSel.addEventListener('change', () => {
        const r = resPins.find(x => x.pin === resSel.value);
        set('loc', resSel.value);
        if (r?.res.pull) asg[n.net].pull = r.res.pull;
        render();
      });
      // (an attribute the format has not: its select disabled)
      const std = h('select', { disabled: !can.iostandard }, h('option', { value: '' }, 'default'), ...iostds.map(s => h('option', { value: s, selected: a.iostandard === s }, s)));
      std.addEventListener('change', () => set('iostandard', std.value));
      const drive = h('select', { disabled: !can.drive }, ...['', ...(can.drive || [])].map(v => h('option', { value: v, selected: String(a.drive || '') === v }, v || '—')));
      drive.addEventListener('change', () => set('drive', drive.value ? +drive.value : undefined));
      const slew = h('select', { disabled: !can.slew }, ...['', ...(can.slew || [])].map(v => h('option', { value: v, selected: String(a.slew || '').toLowerCase() === v }, v || '—')));
      slew.addEventListener('change', () => set('slew', slew.value));
      const pull = h('select', {}, ...['', ...can.pull].map(v => h('option', { value: v, selected: (a.pull || '') === v }, v || '—')));
      pull.addEventListener('change', () => set('pull', pull.value));
      const clk = clocks.find(c => c.net === n.net);
      const per = h('input', { type: 'text', value: clk ? clk.period : '', style: { width: '70px' }, disabled: n.port.dir !== 'in' || n.port.bus });
      per.addEventListener('change', () => {
        clocks = clocks.filter(c => c.net !== n.net);
        if (per.value.trim()) clocks.push({ net: n.net, period: per.value.trim(), duty: 50 });
        changed();
      });
      const conflict = a.loc && (u.get(a.loc.toUpperCase()) || []).length > 1;
      tbl.append(h('tr', {}, h('td', {}, n.net), h('td', {}, n.port.dir === 'in' ? 'Input' : n.port.dir === 'out' ? 'Output' : 'Bidir'),
        h('td', {}, resSel), h('td', { class: conflict ? 'conflict' : '', title: conflict ? `Pin used by ${u.get(a.loc.toUpperCase()).join(', ')}` : '' }, loc),
        h('td', {}, std), h('td', {}, drive), h('td', {}, slew), h('td', {}, pull), h('td', {}, per)));
    }
    tableHost.append(tbl, h('datalist', { id: 'pp-pins' }, ...resPins.map(r => h('option', { value: r.pin }, r.label))));
    const assigned = nets.filter(n => asg[n.net]?.loc).length;
    setStatus(`${assigned}/${nets.length} I/Os assigned`);
    // resources panel
    // (the groups folded, read before they are drawn again)
    for (const d of resHost.querySelectorAll('details.pp-grp')) { const name = d.dataset.grp; if (d.open) closedGroups.delete(name); else closedGroups.add(name); }
    resHost.innerHTML = '';
    if (!board) { resHost.append(h('div', { class: 'asm-section pp-none' }, 'No board selected. Choose one in Project ▸ Design Properties to see the board resources and auto-assign pins.')); return; }
    let grp = null, body = null;
    for (const r of board.resources) {
      if (!body || r.group !== grp) {
        grp = r.group;
        const name = grp || 'Other';
        body = h('div', { class: 'asm-section-body' });
        resHost.append(h('details', { class: 'asm-section pp-grp', 'data-grp': name, open: !closedGroups.has(name) }, h('summary', {}, name), body));
      }
      // (each pin a target of the Board view's drops, #2715: VGA, PS/2, the Pmods…; its right-click menu, the bits off it)
      r.pins.forEach((pin, i) => {
        const who = u.get(pin);
        body.append(h('div', { class: `res pp-target${who ? ' used' : ''}`, 'data-res': r.name, 'data-idx': i, oncontextmenu: e => pinMenu(e, pin),
          title: `${r.label}${r.verified === false ? ' (unverified)' : ''}${who ? `\nassigned to ${who.join(', ')}` : ''}` },
          h('span', {}, r.pins.length > 1 ? `${r.name}<${i}>` : r.name), h('span', {}, pin)));
      });
    }
  }

  // by name (clk, led, sw, btn, seg, an…), then the ports left by direction: inputs on the free
  // switches and buttons, outputs on the LEDs (packages/silinx-fpga/src/ucf.js boardAutoAssign)
  function autoAssign() {
    const r = boardAutoAssign(ports.map(p => ({ name: p.name, dir: p.dir, width: p.width, msb: p.msb, lsb: p.lsb })), board, { byDirection: true });
    for (const [net, a] of Object.entries(r.assignments)) asg[net] = { ...(asg[net] || {}), ...a };
    for (const c of r.clocks) if (!clocks.some(x => x.net === c.net)) clocks.push(c);
    changed();
    render();
    const n = Object.keys(r.assignments).length;
    const dirN = r.byDirection.reduce((k, d) => k + d.nets.length, 0);
    const msg = [`${n} I/Os assigned from ${board.name}`];
    if (dirN) msg.push(`${dirN} by direction (${r.byDirection.map(d => `${d.port} → ${d.nets.map(([, l]) => l).join(', ')}`).join('; ')})`);
    if (r.unmatched.length) msg.push(`not assigned: ${r.unmatched.join(', ')}`);
    // (an action done: a toast; nothing assigned: a warning of the console, #3591)
    if (n) { toast(msg.join('; '), 'ok', 8000); app.log(`I/O Pin Planning: ${msg.join('; ')}.`, r.unmatched.length ? 'warn' : 'ok'); }
    else logWarning(`I/O Pin Planning: ${msg.join('; ')}.`);
  }

  let lastDups = '';
  async function save() {
    const u = used();
    const dup = [...u.entries()].filter(([, v]) => v.length > 1);
    // (a message the console's, not its status line's, #2784: once, until the pins in question change; saved, the tab's mark)
    const dups = dup.map(([k]) => k).join(', ');
    if (dups && dups !== lastDups) app.log(`I/O Pin Planning: pins assigned more than once: ${dups}.`, 'warn');
    lastDups = dups;
    const text = writePins(pj.device, {
      ports: ports.map(p => ({ name: p.name, dir: p.dir, msb: p.msb, lsb: p.lsb, width: p.width })),
      assignments: asg, clocks, other,
      header: `${constraintsExt(pj.device).slice(1).toUpperCase()} generated by Silinx I/O Pin Planning for top '${top}' (${pj.device.part}${pj.device.speed}-${pj.device.package}${board ? `, ${board.name}` : ''})`,
    });
    if (!S.project.constraints) S.project.constraints = `constraints/top${constraintsExt(pj.device)}`;
    pj.constraints = S.project.constraints;
    await api.writeFile(pj.name, pj.constraints, text);
    await app.saveProjectJson();
    await app.reloadProject();
    setDirty(doc, false);
    const d = app.findDoc(`file:${pj.constraints}`);
    if (d) { d.editor.setValue(text); d.editor.markClean(); setDirty(d, false); }
  }

  load();
  return { save };
}
