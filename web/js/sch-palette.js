// The schematic editor's symbols palette (#405: out of mountSchEditor in sch-editor.js): the categories and the
// search, the symbols listed with their drawings, a symbol picked to place (its Symbol Info shown), the collapsed
// categories remembered.
import { SYMBOLS, SYMBOL_CATEGORIES, defaultParams, symbolDef } from '/core/schdoc.js';
import { bodySvg, r1 } from './sch-svg.js';
import { devicePrimitives } from '/core/primitives.js';
import { esc, h } from './dom.js';
import { popupMenu } from './ui.js';

/** { catSel, renderPalette, search, symInfo } of mountSchEditor (device(), doc(), infoItem(), modules(), placing(): its current values). */
export function mountSchPalette(ctx) {
  const {
    device, doc, infoItem, itemTarget, left, modules, openInfo, placing, readOnly, showSymInfo, startPlace, setInfoItem
  } = ctx;

  // ---------------- left: symbols palette
  const search = h('input', { type: 'search', class: 'se-search', placeholder: 'Search symbols…' });
  const catSel = h('select', { class: 'se-cat' });
  const symList = h('div', { class: 'se-symlist' });
  const symInfo = h('div', { class: 'se-syminfo' });
  left.append(h('div', { class: 'se-cap', text: 'Symbols' }), h('div', { class: 'se-lefttools' }, h('label', { text: 'Categories' }), catSel, search), symList, symInfo);
  const collapsed = new Set();
  function paletteItems() {
    const items = [];
    for (const [type, S] of Object.entries(SYMBOLS)) {
      if (type === 'module' || S.hidden) continue;
      // (a device primitive: of the project's family only, #791)
      if (S.families && !S.families.includes(device()?.family)) continue;
      // parameterised symbols listed under their Xilinx-style names (D2_4E, DEMUX1_4...), then the generic one
      for (const pr of S.presets || []) items.push({ type, cat: S.category, title: pr.title, desc: pr.description || S.description, params: { ...pr.params }, preset: pr.title });
      // (the decoders and encoders by their presets only: the generic DECODER / ENCODER are the same symbols, #301)
      if (!S.presetsOnly) items.push({ type, cat: S.category, title: S.paletteTitle || S.title, desc: S.paletteDescription || S.description, params: {} });
    }
    // (the device primitives in their family's order, #791)
    const order = devicePrimitives(device()?.family).map(p => p.type);
    const prims = items.filter(it => SYMBOLS[it.type].prim).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    items.forEach((it, k) => { if (SYMBOLS[it.type].prim) items[k] = prims.shift(); });
    // (not a test bench, #332: a Simulation-only source, or a module without ports, which a schematic cannot connect)
    for (const m of Object.values(modules()).filter(x => !x.block && !x.testbench && x.ports?.length).sort((a, b) => a.name.localeCompare(b.name))) {
      if (m.name === doc().name) continue;
      items.push({ type: 'module', cat: 'Project modules', title: m.name, desc: `${m.ports?.length || 0} ports${m.lang ? ` · ${m.lang.toUpperCase()}` : ''}${m.file ? ` · ${m.file}` : ''}`, params: { module: m.name, generics: {} } });
    }
    return items;
  }
  function previewSvg(it) {
    const sym = { id: 'pv', type: it.type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: { ...defaultParams(it.type), ...it.params } };
    const def = symbolDef(sym, modules());
    const pad = 4, W = 54, H = 34;
    const sc = Math.min(1, (W - 2 * pad) / def.w, (H - 2 * pad) / def.h);
    const ox = (W - def.w * sc) / 2, oy = (H - def.h * sc) / 2;
    return `<svg class="se-pv" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><g transform="translate(${r1(ox)},${r1(oy)}) scale(${r1(sc * 100) / 100})">${bodySvg(sym, def)}</g></svg>`;
  }
  function renderPalette() {
    const q = search.value.trim().toLowerCase();
    const cat = catSel.value;
    const items = paletteItems().filter(it => (cat === '<all>' || it.cat === cat) && (!q || `${it.title} ${it.type} ${it.desc}`.toLowerCase().includes(q)));
    symList.innerHTML = '';
    const cats = [...SYMBOL_CATEGORIES];
    for (const c of cats) {
      const its = items.filter(i => i.cat === c);
      if (!its.length && !((c === 'Project modules' || c === 'Device Primitives') && cat === c)) continue;
      const open = !collapsed.has(c) || q;
      const head = h('div', { class: `se-cathead${open ? ' open' : ''}`, text: `${c} (${its.length})`, onclick: () => { if (collapsed.has(c)) collapsed.delete(c); else collapsed.add(c); renderPalette(); } });
      symList.append(head);
      if (!open) continue;
      if (!its.length) symList.append(h('div', { class: 'se-empty', text: c === 'Device Primitives' ? 'No device primitives for this device\'s family' : 'No other modules in the project' }));
      for (const it of its) {
        const row = h('div', {
          class: `se-symrow${placing() && placing().type === it.type && (placing().preset || null) === (it.preset || null) && (it.type !== 'module' || placing().params.module === it.params.module) ? ' active' : ''}`,
          draggable: 'true', title: it.desc,
          html: `${previewSvg(it)}<span class="nm" data-no-i18n>${esc(it.title)}</span>`,
        });
        row.addEventListener('click', () => { setInfoItem(it); startPlace(it); showSymInfo(it); });
        // (on a tablet, a long press: no menu, its browser's nor ours; with a mouse, the right click's, #1990)
        row.addEventListener('pointerdown', e => { row.pointerType = e.pointerType; });
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (row.pointerType === 'touch' || row.pointerType === 'pen') return;
          setInfoItem(it); showSymInfo(it);
          popupMenu([{ label: 'Symbol Info…', shortcut: 'F1', action: () => openInfo(itemTarget(it)) }, ...(readOnly ? [] : [{ label: 'Place Symbol', action: () => startPlace(it) }])], e.clientX, e.clientY);
        });
        row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-silinx-symbol', JSON.stringify(it)); e.dataTransfer.effectAllowed = 'copy'; });
        Object.assign(row.style, { webkitTouchCallout: 'none', webkitUserSelect: 'none', userSelect: 'none' });
        symList.append(row);
      }
    }
  }
  // the small info box under the palette: first sentence of the datasheet + More… (Symbol Info)

  return { catSel, renderPalette, search, symInfo };
}
