// Silinx toolchain - the packer's configuration strings (#405: out of packWith in core/fpga/pack.js): the instances'
// names and settings (slices, IOBs, clock buffers, block RAMs, multipliers, DCMs) as ISE's map writes them.
import { initToEquation } from './lut.js';
import { paramBits, paramInt } from './netlist.js';
import { BRAM_WIDTH, escCfg } from './pack.js';

/** packWith's instances named and given their configuration strings (nothing returned). */
export function mountConfig(ctx) {
  const {
    insts, uniqueName
  } = ctx;

  // ---------------------------------------------------------------- configuration strings
  for (const s of insts) if (s.kind === 'iob') s.name = uniqueName(s.name);   // pads keep their port's name
  // names of the slices: the first flip-flop or LUT inside
  for (const s of insts) if (s.kind === 'slice') {
    const base = s.ff.X?.name || s.ff.Y?.name || s.lut.F?.name || s.lut.G?.name || `slice${s.idx}`;
    s.name = uniqueName(base);
  }
  for (const s of insts) {
    if (s.kind === 'iob') { s.cfg = s.fixedCfg.map(([attr, name, value]) => ({ attr, name: name ? escCfg(name) : '', value })); continue; }
    if (s.kind === 'bufg') {
      s.name = uniqueName(s.name);
      const n = escCfg(s.name);
      s.cfg = (s.mux ? [['DISABLE_ATTR', '', s.mux], ['I0_USED', '', '0'], ['I1_USED', '', '0'], ['SINV', '', 'S'], ['GCLKMUX', `${n}.GCLKMUX`, '']]
        : [['DISABLE_ATTR', '', 'LOW'], ['I0_USED', '', '0'], ['SINV', '', 'S_B'], ['GCLKMUX', `${n}.GCLKMUX`, ''], ['GCLK_BUFFER', n, '']]).map(([attr, name, value]) => ({ attr, name, value }));
      continue;
    }
    if (s.kind === 'bram') { s.name = uniqueName(s.name); bramCfg(s); continue; }
    if (s.kind === 'mult') { s.name = uniqueName(s.name); multCfg(s); continue; }
    if (s.kind === 'dcm') { s.name = uniqueName(s.name); dcmCfg(s); continue; }
    sliceCfg(s);
  }
  // a parameter (binary string, most significant bit first, x read as 0) as hexadecimal of `bits` bits
  function paramHex(v, bits) {
    const b = paramBits(v) || [];
    let n = 0n;
    for (let i = Math.min(b.length, bits) - 1; i >= 0; i--) n = (n << 1n) | BigInt(b[i]);
    return n.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
  }
  function bramCfg(s) {
    const cfg = [];
    const add = (attr, name, value) => cfg.push({ attr, name, value });
    const p = s.params, n = escCfg(s.name);
    const prm = (name, port) => (s.single ? p[name] : p[`${name}_${port}`]);
    for (const port of Object.keys(s.ports)) {
      for (const pin of ['CLK', 'EN', 'SSR', 'WE']) add(`${pin}${port}INV`, '', `${pin}${port}`);
      add(`PORT${port}_ATTR`, '', BRAM_WIDTH[s.ports[port]].attr);
      add(`WRITEMODE${port}`, '', String(prm('WRITE_MODE', port) || 'WRITE_FIRST').trim());
    }
    add('RAMB16', `${n}.RAMB16`, '');
    for (const port of Object.keys(s.ports)) add(`RAMB16${port}`, `${n}.${port}`, '');
    const get = k => p[k] ?? p[k.toLowerCase()] ?? p[k.replace(/_([0-9A-F]{2})$/, (m, h) => `_${h.toLowerCase()}`)];
    for (let i = 0; i < 8; i++) { const k = `INITP_${i.toString(16).padStart(2, '0').toUpperCase()}`; add(`INITP_0${i}`, '', paramHex(get(k), 256)); }
    for (let i = 0; i < 64; i++) { const h = i.toString(16).padStart(2, '0'); add(`INIT_${h}`, '', paramHex(get(`INIT_${h.toUpperCase()}`), 256)); }
    for (const port of Object.keys(s.ports)) {
      const w = BRAM_WIDTH[s.ports[port]], bits = w.data + w.par;
      add(`INIT_${port}`, '', paramHex(prm('INIT', port), bits));
      add(`SRVAL_${port}`, '', paramHex(prm('SRVAL', port), bits));
    }
    s.cfg = cfg;
  }
  // as ISE's map writes a DCM_SP (the FACTORY_JF and LL_HEX settings set no bits)
  function dcmCfg(s) {
    const d = s.dcm;
    const cfg = [['CLKDV_DIVIDE', '', d.CLKDV_DIVIDE], ...(d.divideBy2 ? [['CLKIN_DIVIDE_BY_2', '', 'CLKIN_DIVIDE_BY_2']] : []), ['CLKOUT_PHASE_SHIFT', '', d.CLKOUT_PHASE_SHIFT], ['CLK_FEEDBACK', '', d.CLK_FEEDBACK],
      ['DESKEW_ADJUST', '', d.DESKEW_ADJUST], ['DFS_FREQUENCY_MODE', '', d.DFS_FREQUENCY_MODE], ['DLL_FREQUENCY_MODE', '', d.DLL_FREQUENCY_MODE],
      ['DUTY_CYCLE_CORRECTION', '', d.DUTY_CYCLE_CORRECTION], ['FACTORY_JF1', '', '0XC0'], ['FACTORY_JF2', '', '0X80']];
    // the startup sequence waits for the lock (also the COR register: bitgen.js)
    if (d.startupWait) cfg.push(['STARTUP_WAIT', '', 'STARTUP_WAIT']);
    for (const pin of ['PSCLK', 'PSEN', 'PSINCDEC', 'RST']) cfg.push([`${pin}INV`, '', pin]);
    cfg.push(['DCM', escCfg(s.name), ''], ['CLKFX_DIVIDE', '', d.CLKFX_DIVIDE], ['CLKFX_MULTIPLY', '', d.CLKFX_MULTIPLY]);
    for (const h of ['COM', 'DFS', 'DLLC', 'DLLS', 'MISC']) cfg.push([`LL_HEX_${h}`, '', '']);
    cfg.push(['PHASE_SHIFT', '', d.PHASE_SHIFT]);
    if (d.period !== null) cfg.push(['X_CLKIN_PERIOD', '', d.period.toFixed(16)]);
    s.cfg = cfg.map(([attr, name, value]) => ({ attr, name, value }));
  }
  function multCfg(s) {
    const p = s.params;
    const reg = k => (s.mult === 'MULT18X18SIO' ? String(paramInt(p[k], 1)) : s.mult === 'MULT18X18S' && k === 'PREG' ? '1' : '0');
    const cfg = [['AREG', '', reg('AREG')], ['BREG', '', reg('BREG')], ['B_INPUT', '', String(p.B_INPUT || 'DIRECT').trim()]];
    // (the inverter settings of the connected pins)
    const inv = pin => (s.conn.has(pin) ? [[`${pin}INV`, '', pin]] : []);
    for (const pin of ['CEA', 'CEB', 'CEP', 'CLK']) cfg.push(...inv(pin));
    cfg.push(['PREG', '', reg('PREG')], ['PREG_CLKINVERSION', '', '0']);
    for (const pin of ['RSTA', 'RSTB', 'RSTP']) cfg.push(...inv(pin));
    cfg.push(['MULT18X18SIO', escCfg(s.name), '']);
    s.cfg = cfg.map(([attr, name, value]) => ({ attr, name, value }));
  }
  function sliceCfg(s) {
    const cfg = [];
    const add = (attr, name, value) => cfg.push({ attr, name, value });
    const nm = x => escCfg(x);
    for (const side of ['F', 'G']) {
      const lut = s.lut[side];
      if (lut?.mem) {
        // a RAM / shift register: its contents in hexadecimal (bit a = address a)
        add(side, nm(lut.name), `#RAM:D=0x${lut.mem.init.toString(16).toUpperCase().padStart(4, '0')}`);
        if (lut.mem.mode) add(`${side}_ATTR`, '', lut.mem.mode);
      } else if (lut) add(side, nm(lut.name), `#LUT:${initToEquation(lut.init, lut.k, lut.pins)}`);
    }
    for (const X of ['X', 'Y']) {
      const f = s.ff[X];
      if (!f) continue;
      add(`FF${X}`, nm(f.name), f.ctrl.latch ? '#LATCH' : '#FF');
      add(`FF${X}_INIT_ATTR`, '', f.init ? 'INIT1' : 'INIT0');
      // (beside a shift register, whose shift enable has SR, ISE's map writes SRLOW)
      add(`FF${X}_SR_ATTR`, '', f.kind.sr && f.kind.high ? 'SRHIGH' : f.kind.sr ? 'SRLOW' : (f.init && !s.mctrl ? 'SRHIGH' : 'SRLOW'));
      add(`D${X}MUX`, '', f.dsrc === 'mux' ? '1' : '0');
    }
    if (s.mctrl) {
      // a SLICEM's RAMs / shift registers: write clock, enable on SR, data in, write strobe
      const m = s.mctrl;
      if (!s.ctrl) add('CLKINV', '', m.clkInv ? 'CLK_B' : 'CLK');
      add('SRINV', '', 'SR');
      if (s.dmux?.F) add('DIF_MUX', '', s.dmux.F);
      if (s.dmux?.G) add('DIG_MUX', '', s.dmux.G);
      if (s.shiftOut) add('SHIFTOUTUSED', '', '0');
      const first = s.lut.F || s.lut.G;
      add('WSGEN', `${nm(first.name)}.${m.srl ? 'CE' : 'WE'}`, '');
      if (s.we0) add('SLICEWE0USED', '', '0');
      for (const [on, w] of [[s.wf, 'WF'], [s.wg, 'WG']]) if (on) for (let j = 1; j <= 4; j++) add(`${w}${j}USED`, '', '0');
    }
    if (s.ctrl) {
      add('CLKINV', '', s.ctrl.clkInv ? 'CLK_B' : 'CLK');
      if (s.ctrl.ce !== null) add('CEINV', '', s.ctrl.ceInv ? 'CE_B' : 'CE');
      if (s.ctrl.sr !== null && !s.mctrl) add('SRINV', '', s.ctrl.srInv ? 'SR_B' : 'SR');
      add('SYNC_ATTR', '', s.ctrl.sync ? 'SYNC' : 'ASYNC');
    }
    if (s.b.X !== null) add('BXINV', '', 'BX');
    if (s.b.Y !== null) add('BYINV', '', 'BY');
    // output multiplexers: needed by the X / Y pins or by the flip-flops
    if (s.out.X && (s.used?.X || s.ff.X?.dsrc === 'mux')) add('FXMUX', '', s.out.X);
    if (s.out.Y && (s.used?.Y || s.ff.Y?.dsrc === 'mux')) add('GYMUX', '', s.out.Y);
    if (s.used?.X) add('XUSED', '', '0');
    if (s.used?.Y) add('YUSED', '', '0');
    if (s.f5) { add('F5MUX', nm(s.f5.name), ''); if (s.f5out) add('F5USED', '', '0'); }
    if (s.fi) { add('F6MUX', nm(s.fi.name), ''); if (s.fxout) add('FXUSED', '', '0'); }
    if (s.carry) {
      const c = s.carry;
      if (c.init) add('CYINIT', '', c.init);
      for (const side of ['F', 'G']) {
        const st = c[side];
        if (!st) continue;
        if (st.mux) {
          add(`CYMUX${side}`, nm(st.mux.name), '');
          add(`CYSEL${side}`, '', side);
          add(`CY0${side}`, '', st.cy0);
          if (st.cy0 === '0') add(`GND${side}`, nm(`${s.name}.GND${side}`), '');
          if (st.cy0 === '1') add(side === 'F' ? 'C1VDD' : 'C2VDD', nm(`${s.name}.C${side === 'F' ? 1 : 2}VDD`), '');
        }
        if (st.xor) add(`XOR${side}`, nm(st.xor.name), '');
      }
      if (s.xb) add('XBUSED', '', '0');
      if (s.yb) add('YBUSED', '', '0');
      if (c.cout) add('COUTUSED', '', '0');
    }
    s.cfg = cfg;
  }
}
