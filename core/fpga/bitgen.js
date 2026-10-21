// Silinx - bitstream generation for the Spartan-3E (browser + Node: XC3S100E, XC3S250E, XC3S500E,
// XC3S1200E): a placed and routed design (XDL, core/xdl.js parseXdl) -> frame data -> a .bit file.
//
// The configuration is the sum of the design's features. A feature belongs to a tile of the device
// and sets a few bits at fixed positions relative to the tile (its column of frames and its row of
// bits): a routing switch (PIP) of a net, a setting of a site (slice, IOB, global buffer), and the
// contents of a LUT. The positions come from the bit database (research/s3e-bitstream/db/*.json),
// built by observing which bits ISE's bitgen sets for small test designs (docs/OPEN-TOOLCHAIN.md).
//
//   const db = makeDb({ layout, lut, tiles, pads, padFeatures, bram })    the JSON files of the
//        database of one device (research/s3e-bitstream/db.mjs loadDb reads them); pads from
//        padsFromDevice(the device description); the bitstream format from the layout
//   const { bytes, unknown } = bitgen(xdlText, db, { name: 'top.ncd', crc: true })
//
// `unknown` lists the features of the design that the database does not know (their bits are not
// set), so a caller can tell whether the bitstream is complete.
import { parseXdl, lutTable } from '../xdl.js';
import { XC3S250E, S3E_DEVICES, writeBit, setBit } from './bitstream.js';

/**
 * The I/O sites of the package's pins: pad name -> [tile, index of the pad among the I/O sites of
 * its tile (IOB, IBUF, DIFFM/DIFFS…, bonded or not)], so that an IOB's settings can be stored once
 * per tile type (features IOB<index>:…). It comes from the device (core/fpga/device.js, built on the
 * device description: shipped for the XC3S250E-CP132, else built from the user's ISE), never from
 * the bit database.
 */
export function padsFromDevice(device) {
  const pads = {};
  for (const [site, [t, k]] of device.siteIndex) {
    const types = device.templates[device.tileTemplate[t]].sites.map(s => s.type);
    if (!/^(IOB|IBUF|DIFF[MS]I?)$/.test(types[k]) || device.tileSites[t][k][1] !== 1) continue;   // bonded pads
    pads[site] = [device.tileNames[t], types.slice(0, k).filter(x => /^(IOB|IBUF|DIFF[MS]I?)$/.test(x)).length];
  }
  return pads;
}

/** The bitstream format of a database's device: from its layout (idcode, frameWords, frames; the
 *  device 'xc3s500e-4-fg320'), else the XC3S250E's. */
export function layoutFormat(layout) {
  const m = /^(xc3s\d+e)(?:-\d+)?(?:-([a-z]+\d+))?$/.exec(String(layout?.device || ''));
  const base = (m && S3E_DEVICES[m[1]]) || XC3S250E;
  const f = { ...base };
  if (m && m[2]) f.part = `${m[1].slice(2)}${m[2]}`;
  if (layout?.idcode) f.idcode = Number(layout.idcode);
  if (layout?.frameWords) f.frameWords = layout.frameWords;
  if (layout?.frames) f.frames = layout.frames;
  return f;
}

/** Join the database files (and the pads of the device) into one object with fast lookups.
 *  padFeatures: the pads' own features (absolute bits, per package), default tiles.padFeatures. */
export function makeDb({ layout, lut, tiles, pads = {}, padFeatures = null, bram = null }) {
  const types = {};
  for (const [type, t] of Object.entries(tiles.types || {})) {
    const feats = new Map();
    for (const [f, bits] of Object.entries(t.features || {})) feats.set(f, bits);
    types[type] = { ...t, feats };
  }
  // a tile type may share the features of another (same switch box), at an offset of its frames and
  // bits (`shift: [df, db]`: the switch box of an I/O tile is the CLB's, 2 frames later in the
  // left column, 16 bits further in the top row); its own features, measured on it, come first
  const own = new Map(Object.entries(types).map(([k, t]) => [k, t.feats]));
  for (const t of Object.values(types)) {
    const src = t.sameAs && own.get(t.sameAs);
    if (!src) continue;
    const [sf, sb] = t.shift || [0, 0];
    const shifted = sf || sb ? [...src].map(([f, bits]) => [f, bits.map(s => shiftBit(s, sf, sb))]) : [...src];
    t.shared = new Map(shifted);
    t.feats = new Map([...shifted, ...t.feats]);
    // the wires of the type's own sites may have other names than the shared type's (the I/O
    // tile's IOIS_X0, IOIS_F1_B0… are the CLB's X0, F1_B0…): `rename: [[regexp, replacement], …]`
    t.rename = (t.rename || []).map(([re, to]) => [new RegExp(re, 'g'), to]);
  }
  // the PIPs a type's features offer that its tiles do not have (#74, research/s3e-bitstream/
  // pip-exceptions.mjs): `absent` for every tile of the type, `absentIn: [{ tiles, absent }]` for some;
  // an entry is a feature "from->to" or a wire (every PIP into or out of it)
  for (const t of Object.values(types)) {
    if (!t.absent && !t.absentIn) continue;
    t.absentAll = new Set(t.absent || []);
    t.absentAt = new Map();
    for (const g of t.absentIn || []) for (const tile of g.tiles) t.absentAt.set(tile, new Set([...(t.absentAt.get(tile) || []), ...g.absent]));
  }
  return { layout, lut, tiles, types, pads, padFeats: padFeatures || tiles.padFeatures || {}, bram, format: layoutFormat(layout) };
}

/** The bits of a feature of a tile type (undefined when the database does not know it). */
export function featureBits(type, feature) {
  if (!type) return undefined;
  const bits = type.feats.get(feature);
  // the terminal tiles' PIPs only join wires at the edges of the chip: no bits
  if (!bits && type.pipsWithoutBits && /->|=-/.test(feature)) return [];
  // site settings whose bits are all in the pad's own features (emptyFeatures: a regexp)
  if (!bits && type.emptyFeatures && new RegExp(type.emptyFeatures).test(feature)) return [];
  if (bits || !type.rename?.length) return bits;
  let f = feature;
  for (const [re, to] of type.rename) f = f.replace(re, to);
  return f === feature ? undefined : type.shared.get(f);
}

/** Does tile `tileName` of type `type` (makeDb's) lack the PIP from -> to (wire names of the tile)
 *  that its type's features offer (#74: `absent`, `absentIn`)? The wires are also asked by their
 *  names in the type's features (`rename`: the I/O tiles' IOIS_X0 is X0). */
export function pipAbsent(type, tileName, from, to) {
  if (!type?.absentAll) return false;
  const at = type.absentAt.get(tileName);
  const has = x => type.absentAll.has(x) || !!at?.has(x);
  const names = [[from, to]];
  if (type.rename?.length) { const r = w => type.rename.reduce((x, [re, by]) => x.replace(re, by), w); names.push([r(from), r(to)]); }
  return names.some(([a, b]) => has(a) || has(b) || has(`${a}->${b}`));
}

/** The type and the X / Y of a tile from its name (CLB_X3Y5 -> CENTER_SMALL… / 3 / 5). */
export function tileOf(name, db) {
  const m = /^(.*)_X(\d+)Y(\d+)$/.exec(name);
  if (!m) return null;
  let type = m[1];
  const x = +m[2], y = +m[3];
  if (type === 'CLB') type = (db.layout.brkRows || []).includes(y) ? 'CENTER_SMALL_BRK' : 'CENTER_SMALL';
  return { name, type, x, y };
}

/** Frame and bit where a tile starts: { frame, bit } (null when the layout does not know it). */
export function tileBase(tile, db) {
  const L = db.layout;
  const cols = (L.typeCols && L.typeCols[tile.type]) || L.cols;
  const rows = (L.typeRows && L.typeRows[tile.type]) || L.rows;
  const frame = cols[tile.x], bit = rows[tile.y];
  return frame === undefined || bit === undefined ? null : { frame, bit };
}

// "df,db" (bit set to 1) or "!df,db" (bit cleared) -> [df, db, value, dx, dy]; "df,db@dx,dy": the bit
// is in the column / row of the tile dx, dy away (an I/O tile also configures its pads with bits in
// the neighbouring tile's frames)
export const parseBit = s => {
  const v = s[0] === '!' ? 0 : 1;
  const [pos, nb] = s.replace('!', '').split('@');
  const [df, db] = pos.split(',').map(Number);
  const [dx, dy] = nb ? nb.split(',').map(Number) : [0, 0];
  return [df, db, v, dx, dy];
};

/** A bit of the database ("df,db", "!df,db", "df,db@dx,dy") moved by sf frames and sb bits. */
export const shiftBit = (s, sf, sb) => {
  const [df, db, v, dx, dy] = parseBit(s);
  return `${v ? '' : '!'}${df + sf},${db + sb}${dx || dy ? `@${dx},${dy}` : ''}`;
};

/** The memory bits set by a block RAM's INIT_xx / INITP_xx settings (64 hexadecimal digits each, the
 *  most significant first): memory bit i = bit i % 256 of INIT_<i / 256>, then the parity bits. */
export function bramBits(cfg) {
  const ones = [];
  for (const c of cfg) {
    const m = /^INIT(P?)_([0-9a-fA-F]{2})$/.exec(c.attr);
    if (!m || !/^[0-9a-fA-F]+$/.test(c.value)) continue;
    const off = (m[1] ? 16384 : 0) + 256 * parseInt(m[2], 16);
    const hex = c.value.padStart(64, '0');
    for (let d = 0; d < 64; d++) {
      const v = parseInt(hex[63 - d], 16);
      for (let j = 0; j < 4; j++) if ((v >> j) & 1) ones.push(off + 4 * d + j);
    }
  }
  return ones;
}

/** The features of a design: [{ tile: name, feature }] plus the LUT contents [{ site, lut: 'F' | 'G', bits }]
 *  and the block RAMs' contents [{ site, ones: [memory bit] }].
 *  A PIP is a feature only on a net with pins (bitgen does not program the routing of a net without
 *  pins). Site settings are `${site kind}${index}:${attr}:${value}` (value '' for a named element). */
export function designFeatures(design, db) {
  const feats = [], luts = [], brams = [];
  // the output pins of each instance that drive a net (a DCM's clock outputs: DCM:OUT:<pin>)
  const outPins = new Map();
  for (const n of design.nets) for (const o of n.outpins) (outPins.get(o.inst) || outPins.set(o.inst, new Set()).get(o.inst)).add(o.pin);
  const typeOf = new Map(design.insts.map(i => [i.name, i.type]));
  const siteByInst = new Map(design.insts.map(i => [i.name, i.placed ? i.site : null])), siteOf = n => siteByInst.get(n) || null;
  for (const inst of design.insts) {
    if (!inst.placed) continue;
    const kind = siteKind(inst, db);
    // a block RAM's contents: memory bits, not features of the tile
    if (inst.type === 'RAMB16') {
      brams.push({ site: inst.site, ones: bramBits(inst.cfg) });
      // the enable and write-enable pins of an unused port: as if not inverted (their bits are set)
      for (const p of ['ENA', 'ENB', 'WEA', 'WEB']) {
        const c = inst.cfg.find(x => x.attr === `${p}INV`);
        if (!c || c.value === '#OFF') feats.push({ tile: inst.tile, feature: `RAMB16:${p}INV:${p}` });
      }
    }
    // a multiplier's clock enables not connected (no registers): as if not inverted (ISE's bitgen
    // sets their bits; measured on a design of multipliers without registers)
    if (inst.type === 'MULT18X18SIO') for (const p of ['CEA', 'CEB', 'CEP']) {
      const c = inst.cfg.find(x => x.attr === `${p}INV`);
      if (!c || c.value === '#OFF') feats.push({ tile: inst.tile, feature: `MULT18X18SIO:${p}INV:${p}` });
    }
    if (!kind) continue;
    // the site is used: some settings are set for every used site
    feats.push({ tile: inst.tile, feature: `${kind}:USED` });
    // a SLICEM site holds an instance of type SLICEM or SLICEL: as a SLICEM it sets 2 bits more
    // (feature SLICEk:SLICEM)
    if (inst.type === 'SLICEM') feats.push({ tile: inst.tile, feature: `${kind}:SLICEM` });
    // an I/O: its direction and I/O standard together ('O:LVCMOS33'), a feature of the pad itself
    // (tile '@M5'): the pads do not repeat one pattern per tile type, so their bits are absolute
    if (/^IOB\d/.test(kind)) {
      const has = a => inst.cfg.some(c => c.attr === a && c.value !== '#OFF');
      const mode = has('OUTBUF') ? (has('INBUF') ? 'IO' : 'O') : 'I';
      const std = (inst.cfg.find(c => c.attr === 'IOATTRBOX') || {}).value || 'NONE';
      // an input whose buffer drives nothing (no net on any output pin of the site): ISE's bitgen
      // writes the pad without its input (I:NOLOAD, whatever the I/O standard; ISE's DRC warns
      // PhysDesignRules:812, dangling pin; measured on every pad of the four devices, #18)
      const noLoad = mode === 'I' && has('INBUF') && !outPins.get(inst.name)?.size;
      feats.push({ tile: `@${inst.site}`, feature: noLoad ? 'I:NOLOAD' : `${mode}:${std}` });
      // drive strength, slew rate and pull: changes to the pad's bits, measured against DRIVE 12
      // (8 for LVCMOS15, 6 for LVCMOS12: db padDriveDefault), SLOW, no pull; the drive and slew of
      // each standard separately (O:DRIVE:8 for LVCMOS33, O:LVTTL:DRIVE:8…)
      const val = a => { const c = inst.cfg.find(x => x.attr === a); return c && c.value !== '#OFF' ? c.value : null; };
      const om = mode === 'I' ? 'I' : 'O';
      const drive = val('DRIVEATTRBOX');
      if (om === 'O' && drive && drive !== ((db.tiles?.padDriveDefault || {})[std] || '12')) feats.push({ tile: `@${inst.site}`, feature: `${std === 'LVCMOS33' ? 'O' : `O:${std}`}:DRIVE:${drive}` });
      if (om === 'O' && val('SLEW') === 'FAST') feats.push({ tile: `@${inst.site}`, feature: `${std === 'LVCMOS33' ? 'O' : `O:${std}`}:SLEW:FAST` });
      if (val('PULL')) feats.push({ tile: `@${inst.site}`, feature: `${om}:PULL:${val('PULL')}` });
      // its registers (#44): bits of the pad's own, as its standard's (near the pads, measured per pad)
      for (const f of iobRegFeatures(inst.cfg)) feats.push({ tile: `@${inst.site}`, feature: f });
    }
    // a LUT not used in a used slice holds the constant 0 (written like any LUT: 16 ones, inverted);
    // a LUT used while the path after it (the X / Y output, or the flip-flop through DXMUX / DYMUX
    // = 1) is not used: bitgen sets the output multiplexer (FXMUX, GYMUX) to all ones (feature
    // SLICEk:FXMUX:#OFF)
    const val = a => (inst.cfg.find(c => c.attr === a) || {}).value;
    const on = a => { const v = val(a); return v !== undefined && v !== '#OFF'; };
    if (/^SLICE/.test(kind)) for (const [l, mux, out, ff, dmux] of [['F', 'FXMUX', 'XUSED', 'FFX', 'DXMUX'], ['G', 'GYMUX', 'YUSED', 'FFY', 'DYMUX']]) {
      if (!inst.cfg.some(c => c.attr === l && /^#(LUT|ROM|RAM):/.test(c.value))) luts.push({ site: inst.site, lut: l, bits: new Array(16).fill(0), kind: 'OFF' });
      else if (!on(out) && !(on(ff) && val(dmux) === '1')) feats.push({ tile: inst.tile, feature: `${kind}:${mux}:#OFF` });
    }
    if (kind === 'DCM') {
      for (const feature of dcmPeriodFeatures(val('X_CLKIN_PERIOD'), val('CLKFX_DIVIDE'), val('CLKFX_MULTIPLY'), on('CLKIN_DIVIDE_BY_2'))) feats.push({ tile: inst.tile, feature });
      // each clock output used has its own enable bit (CLKFX, CLKFX180 and the status pins none)
      for (const pin of outPins.get(inst.name) || []) feats.push({ tile: inst.tile, feature: `DCM:OUT:${pin}` });
      // its CLKIN from a global clock buffer (a BUFGMUX before the DCM, two DCMs in cascade; on the
      // global lines or through general routing): ISE's bitgen clears one bit of DCM:USED
      // (DCM:CLKIN:GCLK, #47)
      if (design.nets.some(n => n.inpins.some(p => p.inst === inst.name && p.pin === 'CLKIN') && n.outpins.some(o => typeOf.get(o.inst) === 'BUFGMUX'))) feats.push({ tile: inst.tile, feature: 'DCM:CLKIN:GCLK' });
      // neither CLKFX nor CLKFX180 used (the frequency synthesizer idle): ISE's bitgen clears three
      // bits of DCM:USED (DCM:DFS:OFF, #47)
      if (!['CLKFX', 'CLKFX180'].some(p => outPins.get(inst.name)?.has(p))) feats.push({ tile: inst.tile, feature: 'DCM:DFS:OFF' });
    }
    // flip-flops without a clock enable: the enable is on (feature SLICEk:CEINV:#OFF)
    if (/^SLICE/.test(kind) && (on('FFX') || on('FFY')) && !on('CEINV')) feats.push({ tile: inst.tile, feature: `${kind}:CEINV:#OFF` });
    const padAttrs = /^IOB\d/.test(kind) ? new Set([...iobPadRegFeatures(inst.cfg).attrs, ...inst.cfg.filter(c => IOB_REG_ATTRS.test(c.attr) && !IOB_PLAIN.test(c.attr)).map(c => c.attr)]) : new Set();
    for (const c of inst.cfg) {
      // underscore settings are notes of the tools, except the constant sources (_GND_SOURCE::Y)
      if (c.value === '#OFF' || (c.attr.startsWith('_') && !/^_(GND|VCC)_SOURCE$/.test(c.attr))) continue;
      if (inst.type === 'RAMB16' && /^INITP?_[0-9a-fA-F]{2}$/.test(c.attr)) continue;
      // a block RAM's output latch values (INIT_A, SRVAL_B…): one feature per bit set, by port width
      if (inst.type === 'RAMB16' && /^(INIT|SRVAL)_[AB]$/.test(c.attr) && /^[0-9a-fA-F]+$/.test(c.value)) {
        const width = val(`PORT${c.attr.slice(-1)}_ATTR`);
        let v = BigInt(`0x${c.value}`);
        for (let i = 0; v; i++, v >>= 1n) if (v & 1n) feats.push({ tile: inst.tile, feature: `${kind}:${c.attr}@${width}:${i}` });
        continue;
      }
      // an I/O's drive, slew and pull are the pad's own features (above), and so are its input
      // delay and its registered output and tristate paths
      if (/^IOB\d/.test(kind) && (/^(DRIVEATTRBOX|SLEW|PULL)$/.test(c.attr) || padAttrs.has(c.attr))) continue;
      // a DCM's input period: its frequency ranges (dcmPeriodFeatures)
      if (kind === 'DCM' && c.attr === 'X_CLKIN_PERIOD') continue;
      if ((c.attr === 'F' || c.attr === 'G') && /^#(LUT|ROM|RAM):/.test(c.value)) {
        const eq = c.value.replace(/^#\w+:/, '');
        luts.push({ site: inst.site, lut: c.attr, bits: lutBits(eq), kind: c.value.slice(1, 4) });
        // a RAM LUT of a SLICEM: as a RAM, a dual-port RAM or a shift register (F_ATTR / G_ATTR)
        const mode = c.value.startsWith('#RAM') && on(`${c.attr}_ATTR`) ? val(`${c.attr}_ATTR`) : null;
        feats.push({ tile: inst.tile, feature: `${kind}:${c.attr}:${c.value.slice(0, 4)}${mode ? `:${mode}` : ''}` });
        continue;
      }
      feats.push({ tile: inst.tile, feature: `${kind}:${c.attr}:${c.name && !c.value ? '' : c.value}` });
    }
  }
  for (const net of design.nets) {
    if (!net.outpins.length && !net.inpins.length) continue;
    const names = pipFeatures(net, db.graph, siteOf);
    net.pips.forEach((p, i) => feats.push({ tile: p.tile, feature: names[i] }));
  }
  return { feats, luts, brams };
}

/** The I/O register settings that are bits of the pad's own (#44, research/s3e-bitstream stage G:
 *  measured per pad, near the pads like the I/O standards' bits): { feats, attrs } — the pad features
 *  of an I/O site's cfg and the settings they stand for (left out of the tile's features).
 *  - an input register's delay: 'IFD:DLYn' (IFD_DELAY_VALUE, DLY0 without the delay line), with the
 *    delay line's elements and multiplexers;
 *  - a direct input's delay: 'IBUF:DLYn' (IBUF_DELAY_VALUE 1-12; none for 0);
 *  - an output path other than the direct one (OMUX OFF1, OFFDDR…): 'OMUX:<v>' and its inverters and
 *    DDR multiplexers ('O1INV:O1_B', 'O1_DDRMUX:1'…); the direct output inverted: 'O1INV:O1_B';
 *  - a tristate path: 'TMUX:<v>' and its inverters ('T1INV:T1'…).
 *  (The database has only the input delay ISE's map chooses by itself, IFD:DLY2 / DLY3: a pad's other
 *  delays interact with its neighbours', so they are refused.) */
export function iobPadRegFeatures(cfg) {
  const val = a => { const c = cfg.find(x => x.attr === a); return c && c.value !== '#OFF' ? (c.name && !c.value ? '' : c.value) : null; };
  const feats = [], attrs = new Set();
  const take = (...as) => as.forEach(a => attrs.add(a));
  const iff = val('IFF1') !== null || val('IFF2') !== null || val('IFFDMUX') !== null;
  if (iff) {
    feats.push(`IFD:${val('IFD_DELAY_VALUE') || 'DLY0'}`);
    take('IFD_DELAY_VALUE', 'IFFDELMUX', 'IFD_DELAY', 'PRE_DELAY_MUX', 'PRE_DELAY');
  }
  if (val('IMUX') !== null) {
    const v = val('IBUF_DELAY_VALUE');
    if (v && v !== 'DLY0') feats.push(`IBUF:${v}`);
    take('IBUF_DELAY_VALUE', 'IBUF_DELAY', 'PRE_DELAY_MUX', 'PRE_DELAY');
    if (v && v !== 'DLY0') take('IDELMUX');
  }
  const om = val('OMUX');
  // the direct output inverted (O1INV O1_B)
  if (om === 'O1' && val('O1INV') === 'O1_B') { feats.push('O1INV:O1_B'); take('O1INV'); }
  if (om !== null && om !== 'O1') {
    feats.push(`OMUX:${om}`);
    take('OMUX');
    for (const a of ['O1INV', 'O2INV', 'O1_DDRMUX', 'O2_DDRMUX', 'ODDROUT1_MUX', 'ODDROUT2_MUX']) if (val(a) !== null) { feats.push(`${a}:${val(a)}`); take(a); }
  }
  const tm = val('TMUX');
  if (tm !== null) {
    feats.push(`TMUX:${tm}`);
    take('TMUX');
    for (const a of ['T1INV', 'T2INV', 'TSMUX']) if (val(a) !== null) { feats.push(`${a}:${val(a)}`); take(a); }
  }
  return { feats, attrs };
}

/** The settings of the I/O registers (and the input delays, the registered output and tristate
 *  paths), and of the plain paths (IOB_PLAIN: no bits of their own, the pad's standard has them). */
export const IOB_REG_ATTRS = /^(IFF[12]|OFF[12]|TFF[12])(_INIT_ATTR|_SR_ATTR)?$|^(IFF|OFF|TFF)ATTRBOX$|^(ICLK[12]|OTCLK[12]|ICE|OCE|TCE|SR|REV|O1|O2|T1|T2)INV$|^(I|O|T)(SR|REV)_USED$|^(IFFDMUX|IFFDELMUX|IDDRIN_MUX|PRE_DELAY_MUX|IFD_DELAY_VALUE|IBUF_DELAY_VALUE|IFD_DELAY|IBUF_DELAY|PRE_DELAY|IDELMUX|IMUX|OMUX|TMUX|TSMUX|T_USED|O1_DDRMUX|O2_DDRMUX|ODDROUT[12]_MUX|OFFDDRBLACKBOX|IFFDDRBLACKBOX|PCICE_MUX|PCIRDY_MUX)$/;
export const IOB_PLAIN = /^(IMUX|IDELMUX|O1INV|OMUX)$/;

/** The pad features of an I/O site's registers (#44, research/s3e-bitstream stage G): the delay and
 *  path features (iobPadRegFeatures), 'R:<setting>:<value>' for every other register setting, and
 *  'R:<setting>:#OFF' for the parts of a used register group left out (iobRegPseudo). Their bits are
 *  the pad's own, measured on each pad (they lie near the pads, as the I/O standards' bits). */
export function iobRegFeatures(cfg) {
  const { feats, attrs } = iobPadRegFeatures(cfg);
  const out = [...feats];
  for (const c of cfg) {
    if (!IOB_REG_ATTRS.test(c.attr) || IOB_PLAIN.test(c.attr) || attrs.has(c.attr) || c.value === '#OFF') continue;
    out.push(`R:${c.attr}:${c.name && !c.value ? '' : c.value}`);
  }
  for (const f of iobRegPseudo(cfg)) out.push(`R:${f}`);
  return out;
}

/** The settings of an I/O site's register groups left out while the group is used (#44): 'IFF2:#OFF'
 *  for an input register without its DDR partner, 'ICEINV:#OFF' for one without a clock enable…
 *  (as a slice's flip-flops without a clock enable): a register's unused parts set bits of their own. */
export const IOB_REG_GROUPS = {
  I: ['IFF1', 'IFF2', 'IFF1_INIT_ATTR', 'IFF2_INIT_ATTR', 'IFF1_SR_ATTR', 'IFF2_SR_ATTR', 'IFFATTRBOX', 'ICLK1INV', 'ICLK2INV', 'ICEINV', 'ISR_USED', 'IREV_USED', 'IDDRIN_MUX'],
  O: ['OFF1', 'OFF2', 'OFF1_INIT_ATTR', 'OFF2_INIT_ATTR', 'OFF1_SR_ATTR', 'OFF2_SR_ATTR', 'OFFATTRBOX', 'OTCLK1INV', 'OTCLK2INV', 'OCEINV', 'OSR_USED', 'OREV_USED'],
  T: ['TFF1', 'TFF2', 'TFF1_INIT_ATTR', 'TFF2_INIT_ATTR', 'TFF1_SR_ATTR', 'TFF2_SR_ATTR', 'TFFATTRBOX', 'OTCLK1INV', 'OTCLK2INV', 'TCEINV', 'TSR_USED', 'TREV_USED'],
};
export function iobRegPseudo(cfg) {
  const on = a => cfg.some(c => c.attr === a && c.value !== '#OFF');
  const used = g => on(`${g}FF1`) || on(`${g}FF2`);
  const out = new Set();
  for (const [g, attrs] of Object.entries(IOB_REG_GROUPS)) if (used(g)) for (const a of attrs) if (!on(a)) out.add(`${a}:#OFF`);
  if (used('I') || used('O') || used('T')) for (const a of ['SRINV', 'REVINV']) if (!on(a)) out.add(`${a}:#OFF`);
  return [...out];
}

/** A DCM's input period (X_CLKIN_PERIOD, ns) as the features of its frequency ranges (measured on
 *  the four DCMs of the XC3S250E, research/s3e-bitstream stages F and #46). ISE works with the period
 *  in whole nanoseconds, truncated (20.99 is 20), doubled by CLKIN_DIVIDE_BY_2 (12.9 is 24): with T that
 *  period, DCM:CLKIN:LOW when T >= 25; DCM:CLKFX_IN:LOW (bits shared by the two DCMs of the top or
 *  bottom pair) when CLKIN is under 5 MHz (T > 200) or the CLKFX output is (T x CLKFX_DIVIDE /
 *  CLKFX_MULTIPLY > 200 ns, the factors as given, not in lowest terms). Without a period: neither
 *  (whatever CLKFX_DIVIDE and CLKFX_MULTIPLY). Every one of the 164 cases measured follows this. */
export function dcmPeriodFeatures(period, divide, multiply, divideBy2 = false) {
  const p = period === undefined || period === null || period === '#OFF' ? null : parseFloat(period);
  const d = parseInt(divide ?? '1', 10) || 1, m = parseInt(multiply ?? '4', 10) || 4;
  if (p === null || Number.isNaN(p) || p <= 0) return [];
  // whole nanoseconds (the period as XDL writes it, 20.0000000000000000 or 12.4000000000000004)
  const t = Math.floor(p + 1e-9) * (divideBy2 ? 2 : 1);
  const out = [];
  if (t >= 25) out.push('DCM:CLKIN:LOW');
  if (t > 200 || t * d > 200 * m) out.push('DCM:CLKFX_IN:LOW');
  return out;
}

/** The feature names of a net's PIPs: "from->to". A bidirectional PIP (XDL "a =- b") is used in one
 *  direction, the one away from the wire that another PIP of the net drives: "a->b" (or "b->a");
 *  it stays "a=-b" when the net does not tell. With the device description (graph: a Device), a
 *  wire is the same as its node's wires in every tile (#23: the XC3S1200E's long-line splitters, a
 *  long line driven in another tile), and a wire of a net's output pin (siteOf(inst): its site) is
 *  driven too. */
export function pipFeatures(net, graph = null, siteOf = null) {
  const driven = new Set(net.pips.filter(p => p.dir !== '=-').map(p => `${p.tile}:${p.to}`));
  const names = net.pips.map(p => {
    if (p.dir !== '=-') return `${p.from}->${p.to}`;
    if (driven.has(`${p.tile}:${p.from}`)) return `${p.from}->${p.to}`;
    if (driven.has(`${p.tile}:${p.to}`)) return `${p.to}->${p.from}`;
    return null;
  });
  if (names.includes(null) && graph && typeof graph.node === 'function') {
    const node = (tile, wire) => graph.node(tile, wire);
    const nodes = new Set();
    net.pips.forEach((p, i) => { if (names[i]) { const n = node(p.tile, names[i].split('->')[1]); if (n >= 0) nodes.add(n); } });
    for (const o of net.outpins) { const site = siteOf?.(o.inst); if (site) { const n = graph.sitePinNode(site, o.pin); if (n >= 0) nodes.add(n); } }
    // (a bidirectional PIP after another: until no more is decided)
    for (let more = true; more;) {
      more = false;
      net.pips.forEach((p, i) => {
        if (names[i]) return;
        const a = node(p.tile, p.from), b = node(p.tile, p.to);
        if (a >= 0 && nodes.has(a)) names[i] = `${p.from}->${p.to}`;
        else if (b >= 0 && nodes.has(b)) names[i] = `${p.to}->${p.from}`;
        else return;
        nodes.add(names[i] === `${p.from}->${p.to}` ? b : a);
        more = true;
      });
    }
  }
  return names.map((n, i) => n || `${net.pips[i].from}=-${net.pips[i].to}`);
}

/** The 16 memory bits of a LUT from its XDL equation: an expression of A1-A4, or the initial value
 *  of a RAM / shift register in hexadecimal ("D=0x1234", bit a = address a). */
export function lutBits(eq) {
  const m = /^D=0x([0-9a-fA-F]{1,4})$/.exec(eq);
  if (!m) return lutTable(eq, 4).bits;
  const v = parseInt(m[1], 16);
  return Array.from({ length: 16 }, (_, a) => (v >> a) & 1);
}

/** The kind and index of a site inside its tile: SLICE0…3 (by the parity of X and Y), IOB0…2
 *  (the pads of a tile, from the database), or the site type for single-site tiles. */
export function siteKind(inst, db) {
  const m = /^SLICE_X(\d+)Y(\d+)$/.exec(inst.site || '');
  if (m) return `SLICE${(+m[1] & 1) * 2 + (+m[2] & 1)}`;
  if (inst.type === 'IOB' || inst.type === 'IBUF' || /^DIFF/.test(inst.type)) {
    const p = db.pads[inst.site];
    return p ? `IOB${p[1]}` : null;
  }
  if (inst.type === 'VCC' || inst.type === 'GND' || inst.type === 'TIEOFF') return null;
  // global clock buffers: their tiles (CLKB, CLKT, CLKL, CLKR) have one instance each, so the site
  // name says which buffer it is
  if (/^BUFGMUX_/.test(inst.site || '')) return inst.site;
  return inst.type;
}

// general routing wires (doubles, hexes, long lines, the output multiplexers): a switch into one is
// a multiplexer setting, never free
const GENERAL_WIRE = /^([EWNS](2|6)(BEG|MID|END|[A-D])\d+|[EWNS]2END_[NS]\d+|L[HV]\d+|OMUX\w*)$/;
// the clock wires of an I/O tile (into its registers' ICLK1 / OTCLK1… pins)
const IO_CLOCK = /^IOIS_CLK\d$/;

/**
 * What the database lets a router use, so that its output turns into a complete bitstream
 * (core/fpga/route.js routeDesign options; exceptions: false leaves out the PIPs tiles lack, only to
 * measure them, research/s3e-bitstream/pip-exceptions.mjs):
 *   allowPip(tileName, from, to)   the PIP "from->to" (direction of the signal) is a feature of the
 *                                  tile's type and the layout knows where the tile is; a feature
 *                                  with no bits counts as known for dedicated wires (carry chain
 *                                  COUT -> CIN, pin wires, the clock spines, the terminations), not
 *                                  for a switch driving a general routing wire (such an entry was
 *                                  a measurement artefact: W6END4->E2BEG4 of the left I/O tiles
 *                                  sets 2 bits; the I/O tiles now share the CLB switch box); never
 *                                  among the own features of a tile type marked noRoute (those of the
 *                                  switch box it shares, sameAs, stay: the XC3S1200E's other long-line
 *                                  splitters, #709, in the centre column's CLKV_LL, whose clock switches
 *                                  are CLKV's; CLKH_LL's are routed since #23);
 *                                  never one the tile does not have though its type's features offer
 *                                  it (pipAbsent, #74: with a device description from ISE the router
 *                                  meets only PIPs the tile has; one built from the database's
 *                                  features per type needs them)
 *   delayPip(tileName, from, to)   the PIPs the placer's delay table counts (timing.js delayTable):
 *                                  allowPip's but for a tile type marked splitter (the XC3S1200E's
 *                                  long-line splitters, #23: the router takes one where it is
 *                                  faster; counted in the table they make far vertical offsets look
 *                                  faster than they route, and the placements slower)
 *   allowConstSource(kind, site)   a VCC site (no settings of its own) or a slice whose settings as
 *                                  a GND source (USED, _GND_SOURCE:Y) are known
 *   allowBufg(tileName, site)      a global clock buffer whose settings (USED) are known: the top and
 *                                  bottom ones, and the side ones (CLKL / CLKR, #45), which the placer
 *                                  keeps out of the half of the top / bottom buffer of the same line
 *                                  (#95; research/s3e-bitstream/README.md, stage G)
 *   allowPad(site, cfg)            an I/O instance (its cfg) on a pad: the settings of its registers and
 *                                  their paths measured on that pad (#96)
 */
export function knownRouting(db, { exceptions = true } = {}) {
  // each tile's type and whether the layout knows it, once per tile (the router and the placer's
  // clock reach ask about the PIPs of every tile many times, #55)
  const tiles = new Map();
  const tileInfo = name => {
    let v = tiles.get(name);
    if (!v) { const t = tileOf(name, db); v = { type: t ? db.types[t.type] : undefined, placed: !!(t && tileBase(t, db)) }; tiles.set(name, v); }
    return v;
  };
  const bitsOf = (tileName, feature) => {
    const t = tileInfo(tileName);
    return t.placed ? featureBits(t.type, feature) : undefined;
  };
  const known = (tileName, feature) => !!bitsOf(tileName, feature);
  const allowPip = (tileName, from, to) => {
    const { type } = tileInfo(tileName);
    if (type?.noRoute && !type.shared?.has(`${from}->${to}`)) return false;
    // an I/O tile's clock pin (IOIS_CLKj) from the global lines only, never from general routing: ISE clocks the
    // IOBs from the global lines, and the packer puts in the IOBs only registers on a global clock (#671)
    if (IO_CLOCK.test(to) && GENERAL_WIRE.test(from)) return false;
    const bits = bitsOf(tileName, `${from}->${to}`);
    return !!bits && (bits.length > 0 || !GENERAL_WIRE.test(to)) && !(exceptions && pipAbsent(type, tileName, from, to));
  };
  return {
    allowPip,
    delayPip: (tileName, from, to) => !tileInfo(tileName).type?.splitter && allowPip(tileName, from, to),
    allowConstSource: (kind, site) => {
      if (kind === 'vcc') return site.type === 'VCC';
      const kindOf = siteKind({ site: site.name, type: site.type }, db);
      return !!kindOf && known(site.tileName, `${kindOf}:USED`) && known(site.tileName, `${kindOf}:_GND_SOURCE:Y`);
    },
    allowBufg: (tileName, site) => known(tileName, `${site}:USED`),
    // an I/O site's registers and their paths (cfg: the instance's [{ attr, name, value }]) on a pad: their
    // features measured there (#44: each register kind on part of the pads only; the placer's choice, #96)
    allowPad: (site, cfg) => iobRegFeatures(cfg).every(f => !!db.padFeats[site]?.[f]),
  };
}

/** The frame data of a design: { frames, unknown: [{ tile, feature }] }. */
export function frameData(design, db, device = db.format || XC3S250E) {
  const fw = device.frameWords;
  const frames = new Uint32Array(device.frames * fw);
  frames.frameWords = fw;
  for (const [f, b] of db.layout.defaults || []) setBit(frames, fw, f, b, 1);
  const { feats, luts, brams } = designFeatures(design, db);
  const unknown = [];
  const seen = new Set();
  const clears = [];   // bits a feature clears are cleared after all the bits are set
  for (const { tile, feature } of feats) {
    if (tile[0] === '@') {
      // a pad's own feature: absolute positions
      const bits = db.padFeats[tile.slice(1)]?.[feature];
      if (!bits) { const k = `${tile} ${feature}`; if (!seen.has(k)) { seen.add(k); unknown.push({ tile, feature }); } continue; }
      for (const s of bits) { const [f, b, v] = parseBit(s); if (v) setBit(frames, fw, f, b, 1); else clears.push([f, b]); }
      continue;
    }
    const t = tileOf(tile, db);
    const base = t && tileBase(t, db);
    const type = t && db.types[t.type];
    const bits = featureBits(type, feature);
    if (!base || !bits) {
      const k = `${tile} ${feature}`;
      if (!seen.has(k)) { seen.add(k); unknown.push({ tile, feature }); }
      continue;
    }
    for (const s of bits) {
      const [df, dbit, v, dx, dy] = parseBit(s);
      const b = dx || dy ? tileBase({ ...t, x: t.x + dx, y: t.y + dy }, db) : base;
      if (!b) continue;
      if (v) setBit(frames, fw, b.frame + df, b.bit + dbit, 1); else clears.push([b.frame + df, b.bit + dbit]);
    }
  }
  for (const [f, b] of clears) setBit(frames, fw, f, b, 0);
  // LUT contents: 16 bits from the LUT's first bit, in address order, stored inverted (LUT G: the
  // 16 bits before LUT F)
  for (const { site, lut, bits } of luts) {
    const m = /^SLICE_X(\d+)Y(\d+)$/.exec(site);
    const frame = db.lut.colFrame[m[1]], start = db.lut.rowBit[m[2]] - (lut === 'G' ? 16 : 0);
    for (let a = 0; a < 16; a++) setBit(frames, fw, frame, start + a, bits[a] ? 0 : 1);
  }
  // block-RAM contents: every memory bit at its place relative to the block RAM (db.bram)
  for (const { site, ones } of brams) {
    const m = /^RAMB16_X(\d+)Y(\d+)$/.exec(site);
    const B = db.bram;
    if (!B || !m || B.colFrame[m[1]] === undefined) { if (ones.length) unknown.push({ tile: site, feature: 'RAMB16:INIT' }); continue; }
    for (const i of ones) setBit(frames, fw, B.colFrame[m[1]] + B.df[i], B.rowBit[m[2]] + B.db[i], B.inverted ? 0 : 1);
  }
  return { frames, unknown };
}

/** A .bit file for a placed and routed design: { bytes (Uint8Array), unknown }. design: XDL text or
 *  a parseXdl() result. opts: name (the design file name in the header, default `${design}.ncd`),
 *  date, time, crc (default true), startupClk, part (default the database's: its layout's device and
 *  package). A DCM with STARTUP_WAIT sets the COR register's wait for its lock. The format (frames, IDCODE) is the database's device's (db.format). */
export function bitgen(design, db, opts = {}) {
  const d = typeof design === 'string' ? parseXdl(design) : design;
  const device = db.format || XC3S250E;
  const { frames, unknown } = frameData(d, db, device);
  // a DCM with STARTUP_WAIT: the startup sequence waits for its lock (the COR register). ISE's bitgen
  // does so only for the DCMs at the sites DCM_X0Y0, X1Y0, X0Y1, X1Y1 (measured one DCM at a time on
  // the XC3S250E, XC3S500E and XC3S1200E: on the XC3S1200E only X0Y1 and X1Y0 of its eight; the bit of
  // the DCM's own setting is written for every DCM)
  const startupWait = d.insts.some(i => i.type === 'DCM' && /^DCM_X[01]Y[01]$/.test(i.site || '') && i.cfg.some(c => c.attr === 'STARTUP_WAIT' && c.value !== '#OFF'));
  const bytes = writeBit({ frames, name: opts.name || `${d.name || 'design'}.ncd`, device, startupWait, ...opts });
  return { bytes, unknown };
}
