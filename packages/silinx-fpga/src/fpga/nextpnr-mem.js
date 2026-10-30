// Silinx toolchain - a SLICEM's memories in nextpnr's routed design (#2191), as Silinx's packer writes them (fpga/pack-mems.js,
// pack-cfg.js) and ISE's map does: the MEM16 cells on the FMEM / GMEM BELs, their contents, the data's multiplexers, the write
// strobe generator.
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));
const strParam = (c, p) => (typeof c.parameters?.[p] === 'string' ? c.parameters[p].replace(/ $/, '') : c.parameters?.[p]);

/** A PIP inside a SLICEM of the memories' (s3e_gen.py add_slicem): sets the data's multiplexer or SHIFTOUT. pinOf: a wire's site pin. */
export function memSiteRoute(inst, src, dst, pinOf) {
  const m = /^S\d+_MD([FG])$/.exec(dst);
  if (m) {
    const p = pinOf(src);
    inst.mux[`DI${m[1]}`] = /Q15$/.test(src) || p === 'SHIFTIN' ? 'SHIFTIN' : m[1] === 'F' && p === 'BY' ? 'ALTDIF' : p;
    return true;
  }
  if (/^S\d+_FQ15$/.test(src)) { inst.shiftOut = true; return true; }
  return false;
}

/** A slice's memory settings: part 'luts' (F, G and their attributes), part 'controls' (clock, enable, data, write strobe). */
export function memCfg(inst, add, part) {
  const f = inst.cells.FMEM, g = inst.cells.GMEM;
  const mode = c => strParam(c, 'MODE');
  if (part === 'luts') {
    for (const [side, c] of [['F', f], ['G', g]]) {
      if (!c) continue;
      add(side, esc(c.name), `#RAM:D=0x${parseInt(bitsOf(c.parameters.INIT), 2).toString(16).toUpperCase().padStart(4, '0')}`);
      const attr = { SHIFT: 'SHIFT_REG', DUAL: 'DUAL_PORT' }[mode(c)];
      if (attr) add(`${side}_ATTR`, '', attr);
    }
    // (a dual port's F and a RAM32X1S's take G's data)
    if (f && /^(DUAL|RAM32F)$/.test(mode(f))) inst.mux.DIF = 'ALTDIF';
    return;
  }
  const first = f || g, shift = mode(first) === 'SHIFT', inv = parseInt(bitsOf(first.parameters.CLKINV ?? '0'), 2) & 1;
  add('CLKINV', '', inv ? 'CLK_B' : 'CLK');
  add('SRINV', '', 'SR');
  if (inst.mux.DIF) add('DIF_MUX', '', inst.mux.DIF);
  if (inst.mux.DIG) add('DIG_MUX', '', inst.mux.DIG);
  if (inst.shiftOut) add('SHIFTOUTUSED', '', '0');
  add('WSGEN', `${esc(first.name)}.${shift ? 'CE' : 'WE'}`, '');
  if (/^RAM32/.test(mode(first))) add('SLICEWE0USED', '', '0');
  for (const [c, w] of [[f, 'WF'], [g, 'WG']]) if (c && mode(c) !== 'SHIFT') for (let j = 1; j <= 4; j++) add(`${w}${j}USED`, '', '0');
}
