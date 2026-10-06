// I/O Pin Planning: assign top-level ports to package pins / board resources and write the UCF.
import { api } from './api.js';
import { icons } from './icons.js';
import { h, toast, confirmDlg } from './ui.js';
import { generateUcf, parseUcf, bitName } from '/core/ucf.js';
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
  const ports = (design.top?.ports || []).map(p => {
    const t = p.sig.t;
    const bus = t.w > 1;
    return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null, bus };
  });
  const nets = [];
  for (const p of ports) {
    if (!p.bus) nets.push({ net: p.name, port: p, bit: null });
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

  let asg = {}, clocks = [];
  const load = async () => {
    if (pj.constraints && S.fileTree.includes(pj.constraints)) {
      try {
        const u = parseUcf(await api.readFile(pj.name, pj.constraints));
        asg = u.assignments || {}; clocks = u.clocks || [];
      } catch (e) { toast(`Cannot parse UCF: ${e.message}`, 'error'); }
    }
    render();
  };

  const tableHost = h('div', { class: 'pp-table' });
  const resHost = h('div', { class: 'pp-res' });
  const status = h('span', { style: { color: '#555', marginLeft: '10px' } });
  const bar = h('div', { class: 'pp-bar' },
    h('button', { class: 'btn', onclick: () => autoAssign(), disabled: !board, title: board ? 'Match port names with board resources (clk, led, sw, btn, seg, an…)' : 'Select a board in Design Properties' }, 'Auto-assign from Board'),
    h('button', { class: 'btn', onclick: () => { asg = {}; clocks = []; render(); setDirty(doc, true); } }, 'Clear All'),
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
      const set = (k, v) => { asg[n.net] = { ...(asg[n.net] || {}), [k]: v || undefined }; setDirty(doc, true); };
      const loc = h('input', { type: 'text', value: a.loc || '', list: 'pp-pins', style: { textTransform: 'uppercase' } });
      loc.addEventListener('change', () => { set('loc', loc.value.trim().toUpperCase()); render(); });
      const resSel = h('select', {}, h('option', { value: '' }, '—'), ...resPins.map(r => h('option', { value: r.pin, selected: a.loc && r.pin === a.loc.toUpperCase() }, `${r.label} (${r.pin})`)));
      resSel.addEventListener('change', () => {
        const r = resPins.find(x => x.pin === resSel.value);
        set('loc', resSel.value);
        if (r?.res.iostandard) asg[n.net].iostandard = r.res.iostandard;
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
        setDirty(doc, true);
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
    if (!board) { resHost.append(h('div', { style: { color: '#777' } }, 'No board selected. Choose one in Project ▸ Design Properties to see the board resources and auto-assign pins.')); return; }
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

  function autoAssign() {
    const byName = new Map(board.resources.map(r => [r.name.toLowerCase(), r]));
    const aliases = { clock: 'clk', clk_50mhz: 'clk', mclk: 'clk', clk: 'clk', leds: 'led', ld: 'led', switches: 'sw', switch: 'sw', sws: 'sw', buttons: 'btn', btns: 'btn', button: 'btn', segments: 'seg', sseg: 'seg', anodes: 'an', anode: 'an' };
    let n = 0;
    for (const p of ports) {
      const key = p.name.toLowerCase();
      let r = byName.get(key) || byName.get(aliases[key]) || (aliases[key] === 'clk' ? board.resources.find(x => x.group === 'Clock') : null);
      if (!r) continue;
      if (!p.bus) {
        asg[p.name] = { ...(asg[p.name] || {}), loc: r.pins[0], iostandard: r.iostandard, pull: r.pull };
        if (r.group === 'Clock' && r.extra?.period && !clocks.some(c => c.net === p.name)) clocks.push({ net: p.name, period: parseFloat(r.extra.period), duty: 50 });
        n++;
      } else {
        const lo = Math.min(p.msb, p.lsb);
        for (let i = 0; i < Math.min(p.width, r.pins.length); i++) {
          const net = bitName(p.name, lo + i);
          asg[net] = { ...(asg[net] || {}), loc: r.pins[i], iostandard: r.iostandard, pull: r.pull, drive: r.drive, slew: r.slew };
          n++;
        }
      }
    }
    setDirty(doc, true);
    render();
    toast(`${n} I/Os assigned from ${board.name}`, 'ok');
  }

  async function save() {
    const u = used();
    const dup = [...u.entries()].filter(([, v]) => v.length > 1);
    status.textContent = dup.length ? `⚠ pins assigned more than once: ${dup.map(([k]) => k).join(', ')}` : '';
    const text = generateUcf({
      ports: ports.map(p => ({ name: p.name, dir: p.dir, msb: p.msb, lsb: p.lsb, width: p.width })),
      assignments: asg, clocks,
      header: `UCF generated by XAIlinx I/O Pin Planning for top '${top}' (${pj.device.part}${pj.device.speed}-${pj.device.package}${board ? `, ${board.name}` : ''})`,
    });
    if (!pj.constraints) pj.constraints = 'constraints/top.ucf';
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
