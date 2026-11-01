// I/O Pin Planning: assign top-level ports to package pins / board resources and write the UCF.
import { constraintsExt, readPins, writePins } from './constraints-format.js';
import { api } from './api.js';
import { icons } from './icons.js';
import { h, toast, confirmDlg } from './ui.js';
import { bitName, boardAutoAssign } from '/packages/silinx-fpga/src/parts.js';
import { elaborate } from '/core/compile.js';
import { S, app, setDirty } from './app.js';

export function mountPinPlanner(el, doc, top) {
  const pj = S.project;
  const db = S.devices;
  const board = app.projectBoard(pj);
  const root = h('div', { class: 'pin-planner' });
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
  const iostds = db?.families?.find(f => f.id === famId)?.ioStandards || db?.iostandards || ['LVCMOS33', 'LVCMOS25', 'LVTTL'];

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
      } catch (e) { toast(`Cannot parse UCF: ${e.message}`, 'error'); }
    }
    snap();
    render();
  };

  const tableHost = h('div', { class: 'pp-table' });
  const resHost = h('div', { class: 'pp-res' });
  const status = h('span', { style: { color: 'var(--grey-3)', marginLeft: '10px' } });
  const bar = h('div', { class: 'pp-bar' },
    h('button', { class: 'btn', onclick: () => autoAssign(), disabled: !board, title: board ? 'Match port names with board resources (clk, led, sw, btn, seg, an…)' : 'Select a board in Design Properties' }, 'Auto-assign from Board'),
    h('button', { class: 'btn', onclick: () => { asg = {}; clocks = []; render(); changed(); } }, 'Clear All'),
    h('span', {}, `Top: ${top} · Device ${pj.device.part}-${pj.device.package}${board ? ` · Board: ${board.name}` : ' · no board selected'}`),
    status);
  root.append(bar, h('div', { class: 'pp-body' }, tableHost, resHost));

  function used() {
    const m = new Map();
    for (const [n, a] of Object.entries(asg)) if (a.loc) { const k = a.loc.toUpperCase(); m.set(k, [...(m.get(k) || []), n]); }
    return m;
  }

  function render() {
    const u = used();
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
      const std = h('select', {}, h('option', { value: '' }, 'default'), ...iostds.map(s => h('option', { value: s, selected: a.iostandard === s }, s)));
      std.addEventListener('change', () => set('iostandard', std.value));
      const drive = h('select', {}, ...['', '2', '4', '6', '8', '12', '16', '24'].map(v => h('option', { value: v, selected: String(a.drive || '') === v }, v || '—')));
      drive.addEventListener('change', () => set('drive', drive.value ? +drive.value : undefined));
      const slew = h('select', {}, ...['', 'slow', 'fast', 'quietio'].map(v => h('option', { value: v, selected: (a.slew || '') === v }, v || '—')));
      slew.addEventListener('change', () => set('slew', slew.value));
      const pull = h('select', {}, ...['', 'up', 'down', 'keeper'].map(v => h('option', { value: v, selected: (a.pull || '') === v }, v || '—')));
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
    status.textContent = `${assigned}/${nets.length} I/Os assigned`;
    // resources panel
    resHost.innerHTML = '';
    if (!board) { resHost.append(h('div', { style: { color: 'var(--grey-5)' } }, 'No board selected. Choose one in Project ▸ Design Properties to see the board resources and auto-assign pins.')); return; }
    let grp = null;
    for (const r of board.resources) {
      if (r.group !== grp) { grp = r.group; resHost.append(h('div', { class: 'grp' }, grp || 'Other')); }
      r.pins.forEach((pin, i) => {
        const who = u.get(pin);
        resHost.append(h('div', { class: `res${who ? ' used' : ''}`, title: `${r.label}${r.verified === false ? ' (unverified)' : ''}${who ? `\nassigned to ${who.join(', ')}` : ''}` },
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
    toast(msg.join('; '), n ? 'ok' : 'error', 8000);
    app.log(`I/O Pin Planning: ${msg.join('; ')}.`, r.unmatched.length || !n ? 'warn' : 'ok');
  }

  async function save() {
    const u = used();
    const dup = [...u.entries()].filter(([, v]) => v.length > 1);
    status.textContent = dup.length ? `⚠ pins assigned more than once: ${dup.map(([k]) => k).join(', ')}` : '';
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
    if (!status.textContent) status.textContent = `Saved to ${pj.constraints}`;
    const d = app.findDoc(`file:${pj.constraints}`);
    if (d) { d.editor.setValue(text); d.editor.markClean(); setDirty(d, false); }
  }

  load();
  return { save };
}
