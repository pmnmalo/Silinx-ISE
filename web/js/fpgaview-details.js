// Silinx - the FPGA view's site details (#405: out of mountFpgaView in web/js/fpgaview.js): the selected site's
// kind, module, configuration, pins and their nets, and how its LUTs implement their functions (their contents).
import { h } from './ui.js';
import { lutTable } from '/packages/silinx-fpga/src/parts.js';
import { isIo, isSlice, moduleAt, sliceDiagram } from './fpgaview.js';

/** { details } of mountFpgaView (level(), selInst(): its current values). */
export function mountSiteDetails(ctx) {
  const {
    model, onSelectModule, colorOf, highlightModule, level, moduleLabel, netLink, selBox, selInst, select, showNet,
    side
  } = ctx;

  // names inside the selected site's module without its path: 'Inst_data/s_acc1' -> 's_acc1'
  const short = t => { const m = model.insts[selInst()]?.module; return m ? String(t).split(`${m}/`).join('') : t; };
  const kv = (k, v) => h('tr', {}, h('th', {}, k), h('td', {}, v));
  const mono = t => h('span', { class: 'fv-mono', 'data-no-i18n': '' }, t);
  function details() {
    selBox.innerHTML = '';
    if (selInst() < 0) { selBox.append(h('div', { class: 'fv-hint' }, 'Click a site on the chip to see its logic and connections.')); return; }
    const inst = model.insts[selInst()];
    const tbl = h('table', { class: 'fv-kv' },
      kv('Site', mono(`${inst.site} (${inst.type})`)),
      kv('Tile', mono(inst.tile || '—')),
      kv('Module', inst.module || !isIo(inst.type)
        ? h('a', { href: '#', 'data-no-i18n': '', onclick: e => { e.preventDefault(); highlightModule(inst.module); onSelectModule(inst.module); } }, moduleLabel(inst.module))
        : h('span', { 'data-no-i18n': '' }, moduleLabel(''))));
    selBox.append(tbl);
    // the other slices of the same CLB
    const tile = model.device.tiles.find(t => t[2] === inst.tile);
    const clbSlices = tile ? tile[4].filter(x => isSlice(x[1])) : [];
    if (isSlice(inst.type) && clbSlices.length > 1) {
      const bySite = new Map(model.insts.map((x, k) => [x.site, k]));
      selBox.append(h('div', { class: 'fv-clb' }, h('span', { class: 'fv-hint' }, 'Slices of this CLB:'),
        ...clbSlices.map(([name, type]) => {
          const k = bySite.get(name);
          const b = h('button', { class: `fv-clb-s${name === inst.site ? ' cur' : ''}`, disabled: k === undefined, title: k === undefined ? `${name} (${type}): not used` : `${name} (${type})`, 'data-no-i18n': '',
            onclick: () => select(k) }, name.replace(/^SLICE_/, ''));
          if (k !== undefined) b.style.borderColor = colorOf.get(moduleAt(model.insts[k].module, level()));
          return b;
        })));
    }
    if (isSlice(inst.type) && inst.cells.some(c => c.bel === 'F' || c.bel === 'G' || /^FF[XY]$/.test(c.bel))) {
      const big = h('button', { class: 'btn fv-enlarge', title: 'Show the slice and the tables larger', onclick: () => { side.classList.toggle('wide'); big.textContent = side.classList.contains('wide') ? 'Smaller' : 'Enlarge'; } }, side.classList.contains('wide') ? 'Smaller' : 'Enlarge');
      selBox.append(h('h5', { class: 'fv-h-row' }, h('span', {}, 'Inside the slice'), big), sliceDiagram(inst, {
        color: colorOf.get(moduleAt(inst.module, level())),
        netName: p => (inst.pins[p] !== undefined ? short(model.nets[inst.pins[p]].name) : null),
        onPin: p => showNet(inst.pins[p]),
        onPart: bel => selBox.querySelector(`[data-cell="${bel}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      }));
    }
    if (inst.io) {
      selBox.append(h('table', { class: 'fv-kv' },
        kv('Port', mono(inst.name)), kv('Package pin', mono(inst.io.pad)), kv('Direction', inst.io.dir === 'in' ? 'input' : inst.io.dir === 'out' ? 'output' : 'bidirectional'),
        inst.io.standard ? kv('I/O standard', mono(inst.io.standard)) : null, inst.io.drive ? kv('Drive', mono(`${inst.io.drive} mA`)) : null,
        inst.io.slew ? kv('Slew rate', mono(inst.io.slew)) : null, inst.io.pull ? kv('Pull', mono(inst.io.pull)) : null));
    }
    const luts = inst.cells.filter(c => c.kind === 'lut' || c.kind === 'ram' || c.kind === 'rom');
    if (luts.length) {
      selBox.append(h('h5', {}, 'Look-up tables (LUTs)'));
      for (const c of luts) selBox.append(h('div', { class: 'fv-cell', 'data-cell': c.bel },
        h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name)),
        c.kind === 'lut' ? h('div', { class: 'fv-eq', 'data-no-i18n': '', title: 'Signal names without the module path' }, `= ${short(c.text || c.eq)}`) : h('div', { class: 'fv-hint' }, c.kind === 'ram' ? 'used as distributed RAM' : 'used as ROM'),
        c.inputs && Object.keys(c.inputs).length ? h('div', { class: 'fv-ins' }, ...Object.entries(c.inputs).map(([a, n]) => h('span', {}, mono(`${a}: `), netLink(inst.pins[`${c.bel.length === 1 ? c.bel : c.bel[0]}${a.slice(1)}`] ?? model.nets.findIndex(x => x.name === n), n)))) : null,
        c.kind === 'lut' ? lutContents(c, inst) : null));
    }
    const ffs = inst.cells.filter(c => c.kind === 'ff' || c.kind === 'latch');
    if (ffs.length) {
      selBox.append(h('h5', {}, 'Flip-flops'));
      const o = inst.opt;
      for (const c of ffs) {
        const init = o[`${c.bel}_INIT_ATTR`];
        const sr = o[`${c.bel}_SR_ATTR`];
        selBox.append(h('div', { class: 'fv-cell' },
          h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name), c.kind === 'latch' ? ' (latch)' : ''),
          h('div', { class: 'fv-ins' },
            inst.pins.CLK !== undefined ? h('span', {}, 'clock ', netLink(inst.pins.CLK)) : null,
            inst.pins.CE !== undefined ? h('span', {}, 'enable ', netLink(inst.pins.CE)) : null,
            inst.pins.SR !== undefined ? h('span', {}, `${o.SYNC_ATTR === 'SYNC' ? 'synchronous' : 'asynchronous'} ${sr === 'SRHIGH' ? 'set' : 'reset'} `, netLink(inst.pins.SR)) : null,
            init ? h('span', {}, `initial value ${init === 'INIT1' ? '1' : '0'}`) : null)));
      }
    }
    const other = inst.cells.filter(c => !['lut', 'ram', 'rom', 'ff', 'latch'].includes(c.kind));
    if (other.length) {
      selBox.append(h('h5', {}, 'Other elements'));
      const what = { carry: 'carry chain', mux: 'multiplexer', inbuf: 'input buffer', outbuf: 'output buffer', bufg: 'global clock buffer', ramb: 'block RAM', mult: 'multiplier', dsp: 'DSP block', iff: 'input flip-flop', off: 'output flip-flop', tff: '3-state flip-flop', dcm: 'clock manager (DCM)', gclkmux: 'global clock multiplexer' };
      for (const c of other) selBox.append(h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name), h('span', { class: 'fv-hint' }, ` ${what[c.kind] || c.kind}`)));
    }
    const pins = Object.entries(inst.pins).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    if (pins.length) {
      selBox.append(h('h5', {}, 'Connections'));
      selBox.append(h('table', { class: 'fv-kv fv-pins' }, ...pins.map(([p, ni]) => kv(mono(p), netLink(ni)))));
    }
  }
  // how the function is implemented: the LUT is a small memory addressed by its inputs
  function lutContents(c, inst) {
    let t;
    try { t = lutTable(c.eq, /^[A-D]6?LUT$/.test(c.bel) ? 6 : 4); } catch { return null; }
    const name = a => short((c.inputs || {})[a] || a);
    const box = h('div', { class: 'fv-lut' });
    if (c.thru) box.append(h('div', { class: 'fv-hint' }, 'Route-thru: the LUT only passes a signal through (used as a wire).'));
    if (t.rows.length <= 64 && t.inputs.length) {
      box.append(h('table', { class: 'fv-tt' },
        h('tr', {}, ...t.inputs.map(a => h('th', { title: `${a}: ${(c.inputs || {})[a] || '—'}`, 'data-no-i18n': '' }, h('div', {}, name(a)), h('span', { class: 'fv-hint' }, a))), h('th', { 'data-no-i18n': '' }, short(c.name).split('/').pop())),
        ...t.rows.map(r => h('tr', { class: r.out ? 'one' : '' }, ...r.in.map(b => h('td', {}, String(b))), h('td', { class: 'out' }, String(r.out))))));
    }
    const size = t.bits.length;
    box.append(h('div', { class: 'fv-mem', title: 'The LUT\'s memory: one bit per combination of its inputs (address = the inputs A4…A1 as a binary number)' },
      ...t.bits.map((b, a) => h('span', { class: b ? 'one' : '', title: `address ${a.toString(2).padStart(Math.log2(size), '0')} → ${b}` }, String(b))).reverse()),
      h('div', { class: 'fv-hint' }, h('span', {}, 'Memory contents'), ' ', h('span', { class: 'fv-mono', 'data-no-i18n': '' }, `INIT = ${t.init}`), ' ', h('span', {}, `(${size} bits, address ${size - 1} … 0)`)));
    return box;
  }

  return { details };
}
