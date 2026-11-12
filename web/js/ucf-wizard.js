// The UCF Wizard (#2082), New Source ▸ 'Implementation Constraints File' ▸ Wizard >: the ports of a module (the top
// by default), each bit on a pin of the board (assigned from the board as I/O Pin Planning's Auto-assign, then
// changed at will; with no board, the pins typed) -> summary with the file -> the .ucf written, the project's
// constraints file when it has none. In the device's format (#2296): the PCF Wizard (iCE40), the LPF Wizard (ECP5), the
// CST Wizard (Gowin), the XDC Wizard (7-series), their attributes columns of their own (a PCF's pull-up; an LPF's and a
// CST's I/O standard, pull and drive), the file's checks core/constraints-wizard.js's (the MCP's constraints_wizard's).
import { api } from './api.js';
import { h, toast } from './ui.js';
import { bitName, boardAutoAssign, constraintsFormatOf } from '/packages/silinx-fpga/src/parts.js';
import { PIN_ATTRS } from '/core/constraints-check.js';
import { wizardTitle, wizardText, wizardError } from '/core/constraints-wizard.js';
import { elaborate } from '/core/compile.js';
import { wizard, field, replaceGuard, closeBeforeReplace } from './wizards.js';
import { S, app } from './app.js';

// the ports of module `name` as I/O Pin Planning reads them (web/js/pinplanner.js), or the error that stops it
function portsOf(name) {
  const design = elaborate(S.lib, name);
  if (!design.top) return { error: `The ports of '${name}' cannot be read: ${(design.diags || []).find(d => d.severity === 'error')?.message || 'it does not elaborate'}.` };
  return { ports: design.top.ports.map(p => {
    const t = p.sig.t;
    const bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);   // a 1-bit vector is x<0> in the UCF
    return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null, bus };
  }) };
}
// its nets, a bit each (x<7> … x<0>)
function netsOf(ports) {
  const nets = [];
  for (const p of ports) {
    if (!p.bus) { nets.push({ net: bitName(p.name), port: p }); continue; }
    const step = p.msb >= p.lsb ? -1 : 1;
    for (let i = p.msb; ; i += step) { nets.push({ net: bitName(p.name, i), port: p }); if (i === p.lsb) break; }
  }
  return nets;
}

export async function ucfWizard({ path, back = null }) {
  if (!S.project) return;
  const pj = S.project;
  const title = wizardTitle(pj.device), format = constraintsFormatOf(pj.device);
  const guard = replaceGuard(title);
  const board = app.projectBoard(pj);
  // (the attributes the format writes, a column each: none for a UCF's and an XDC's, I/O Pin Planning's)
  const can = ['ucf', 'xdc'].includes(format) ? {} : PIN_ATTRS[format];
  const COLS = [['iostandard', 'I/O Std.', can.iostandard], ['pull', 'Pull', can.pull], ['drive', 'Drive', can.drive]].filter(c => c[2]);
  const standardOf = pin => { for (const r of board?.resources || []) if (r.pins.includes(pin)) return r.pinIostandards?.[pin] || r.iostandard; return null; };
  const mods = S.modules.filter(m => m.role === 'design');
  let top = (mods.find(m => m.name === pj.top) || mods[0])?.name || '';
  let ports = [], err = null, asg = {}, clocks = [];
  const modSel = h('select', { class: 'uw-module', 'data-no-i18n': '' }, ...mods.map(m => h('option', { value: m.name, selected: m.name === top }, m.name)));
  const tbl = h('table', { class: 'grid uw-pins' });
  const note = h('div', { class: 'hint uw-note', style: { marginTop: '6px' } });
  // the board's pins: a select of its resources (LED<0> · P4); none: the pin typed
  const pins = [];
  for (const r of board?.resources || []) r.pins.forEach((pin, i) => pins.push({ pin, label: r.pins.length > 1 ? `${r.name}<${i}>` : r.name }));
  const pinCell = n => {
    const a = asg[n.net] || {};
    // (a CST's I/O standard follows the pin: its bank's on the board)
    const set = v => { if (v) asg[n.net] = { ...a, loc: v, ...(format === 'cst' && standardOf(v) ? { iostandard: standardOf(v) } : {}) }; else delete asg[n.net]; };
    if (!board) {
      const inp = h('input', { type: 'text', class: 'uw-pin', 'data-net': n.net, value: a.loc || '', placeholder: 'e.g. P4', style: { width: '90px' } });
      inp.addEventListener('input', () => set(inp.value.trim().toUpperCase()));
      if (COLS.length) inp.addEventListener('change', render);
      return inp;
    }
    const sel = h('select', { class: 'uw-pin', 'data-net': n.net },
      h('option', { value: '' }, '(none)'), ...pins.map(p => h('option', { value: p.pin, selected: p.pin === a.loc, 'data-no-i18n': '' }, `${p.label} · ${p.pin}`)));
    if (a.loc && !pins.some(p => p.pin === a.loc)) sel.append(h('option', { value: a.loc, selected: true, 'data-no-i18n': '' }, a.loc));
    sel.addEventListener('change', () => { set(sel.value); if (COLS.length) render(); });
    return sel;
  };
  // an attribute of a bit on a pin: a select of the format's values ('—' none written)
  const attrCell = (n, [key, , values]) => {
    const a = asg[n.net];
    const sel = h('select', { class: `uw-${key}`, 'data-net': n.net, disabled: !a, 'data-no-i18n': '' },
      h('option', { value: '' }, '—'), ...values.map(v => h('option', { value: v, selected: String(a?.[key] ?? '').toLowerCase() === v.toLowerCase() }, v)));
    sel.addEventListener('change', () => { if (!asg[n.net]) return; if (sel.value) asg[n.net][key] = sel.value; else delete asg[n.net][key]; });
    return sel;
  };
  const render = () => {
    tbl.innerHTML = '';
    tbl.append(h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Direction'), h('th', {}, 'Pin'), ...COLS.map(c => h('th', {}, c[1]))));
    for (const n of netsOf(ports)) {
      tbl.append(h('tr', {}, h('td', { 'data-no-i18n': '' }, n.net), h('td', { 'data-no-i18n': '' }, n.port.dir), h('td', {}, pinCell(n)), ...COLS.map(c => h('td', {}, attrCell(n, c)))));
    }
    if (err) tbl.append(h('tr', {}, h('td', { colspan: 3 + COLS.length, class: 'hint', style: { padding: '8px' } }, err)));
  };
  const autoAssign = () => {
    asg = {}; clocks = [];
    if (!board) return;
    const r = boardAutoAssign(ports, board, { byDirection: true });
    asg = r.assignments; clocks = r.clocks;
    // (a CST's: each pin's I/O standard the board's, as Update Constraints writes it, #2303)
    if (format === 'cst') for (const a of Object.values(asg)) a.iostandard ||= standardOf(a.loc) || undefined;
    note.textContent = r.unmatched.length ? `Not assigned: ${r.unmatched.join(', ')}.` : '';
  };
  const load = () => {
    top = modSel.value;
    ({ ports = [], error: err = null } = top ? portsOf(top) : { error: 'The project has no design module.' });
    autoAssign();
    render();
  };
  modSel.addEventListener('change', load);
  const assignBtn = h('button', { class: 'btn uw-assign', disabled: !board, onclick: () => { autoAssign(); render(); } }, 'Assign from Board');
  const text = () => wizardText({ device: pj.device, board, ports, assignments: asg, clocks, top });
  const p1 = {
    title: 'Ports and Pins',
    render: () => h('div', {},
      h('div', { class: 'hint' }, board
        ? `Each bit of the module's ports on a pin of the ${board.name}: assigned from the board by their names (clk, led, sw, btn…) and directions; change them at will.`
        : 'No board selected (Project ▸ Design Properties): type the package pin of each bit of the module\'s ports.'),
      h('div', { class: 'form-grid', style: { marginTop: '8px' } }, ...field('Module:', modSel)),
      h('div', { style: { marginTop: '8px', maxHeight: '260px', overflow: 'auto', border: '1px solid var(--frame)' } }, tbl),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' } }, assignBtn), note),
    validate: () => {
      if (err) return err;
      return wizardError({ device: pj.device, board, assignments: asg, text: text() });
    },
  };
  const preview = h('pre', { class: 'uw-preview code-box', style: { maxHeight: '300px', overflow: 'auto', whiteSpace: 'pre' } });
  const pSum = {
    title: 'Summary',
    render: () => h('div', {}, h('div', {}, `The wizard will create ${path}${pj.constraints && S.fileTree.includes(pj.constraints) ? '' : ', the project\'s constraints file'}:`), preview),
    onShow: () => { preview.textContent = text(); },
    validate: () => guard(path),
  };
  load();
  const ok = await wizard(title, [p1, pSum], { width: COLS.length ? 900 : 760, back });
  if (!ok) return;
  const noUcf = !S.fileTree.includes(pj.constraints);
  await closeBeforeReplace(path);
  await api.writeFile(pj.name, path, text());
  await app.reloadProject();
  if (noUcf) { S.project.constraints = path; await app.saveProjectJson(); await app.reloadProject(); }
  const n = Object.keys(asg).length;
  app.log(`${title}: created ${path} for '${top}', ${n} net(s) on pins.`, 'ok');
  toast(`${path.split('/').pop()} created`, 'ok');
  app.openFile(path);
  return path;
}
