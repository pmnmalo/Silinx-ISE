// Silinx - the SLICEM's distributed RAMs and shift registers in the Spartan-6 physical design (#1153, phys.js): the
// site pins of their cells' pins, as ISE's map places them (research/s6/gen-mem6.mjs, one design of each kind
// implemented by ISE) (browser + Node).
//
// A cell takes one or more LUT positions of its slice (ps: D first, as pack.js packs them). The write address is the
// D LUT's inputs, so a position's inputs are its read address (the write address too in D):
//   RAM32X1S / D        a 32-bit RAM in the 64-bit mode: A1 low, the address on A2 … A6 (B2 …: the read port's)
//   RAM64X1S / D        the address on A1 … A6; RAM128X1S / D, RAM256X1S: two or four of them, the 7th address bit
//                       the F7's select (AX: A and B, CX: C and D, CX also the write address's 7th bit, WA7), the 8th
//                       the F8's (BX, WA8); the X1D's read port in the positions after the write port's
//   RAM32M / RAM64M     each position its own address (ADDRA on A1 …, A6 high for the 32-bit O6 / O5 pair)
//   SRL16 … / SRLC32E   the address on A2 … A5 (A6), A1 high (A6 too for a 16-bit one)
// The data: DX in a RAM's D (the X1S / X1D's data in every position, through the DI1 multiplexers), AX … CX in a
// position of its own (a RAM32M's / RAM64M's DIA … and RAM32M's DIA<1> … on AI … DI); a shift register's on AI … DI
// (16-bit) or AX … DX (32-bit). The write enable or clock enable is the slice's CE (WEMUX: CE), the clock its CLK.
// The outputs: O6 on A … D, a RAM32M's O5 (DOA<0> …) on AMUX …, an F7 on AMUX / CMUX, the F8 on BMUX, a shift
// register's cascade (Q15, Q31) on DMUX from position A only.

export const MEM_TYPE = /^(RAM(32|64)X1[SD]|RAM128X1[SD]|RAM256X1S|RAM32M|RAM64M|SRL16E?|SRLC16E|SRLC32E)$/;
export const SRL_TYPE = /^(SRL16E?|SRLC16E|SRLC32E)$/;
const POS = ['A', 'B', 'C', 'D'];

// a pin's bit: A<3> / A3 -> ['A', 3]; D -> ['D', null]
const bitOf = pin => { const m = /^([A-Z]+?)(?:<(\d+)>|(\d+))?$/.exec(pin); return m ? [m[1], m[2] ?? m[3] ?? null].map((x, i) => (i && x !== null ? +x : x)) : [pin, null]; };
const depth = type => +(/^RAM(\d+)/.exec(type)?.[1] ?? 0);

/**
 * The layout of a memory cell in its positions: for each position its part ({ p, port: 'w' | 'r' (the write port's
 * or a read port's address), half: 0 / 1 … (the address range it holds, by the 7th and 8th bits), addr: the address
 * pin's name }) and the cell's outputs' site pins.
 */
export function memLayout(c, ps) {
  const t = c.type;
  if (SRL_TYPE.test(t)) return { parts: [{ p: ps[0], port: 'w', half: 0, addr: 'A' }] };
  if (t === 'RAM32M' || t === 'RAM64M') return { parts: ps.map(p => ({ p, port: 'w', half: 0, addr: `ADDR${p}` })) };
  const dual = /X1D$/.test(t), wide = depth(t) > 64 ? depth(t) / 64 : 1;
  // (the read port's positions after the write port's; within a port, the low half first: D LOW, C HIGH)
  const per = wide, parts = [];
  ps.forEach((p, i) => parts.push({ p, port: dual && i >= per ? 'r' : 'w', half: i % per, addr: dual && i >= per ? 'DPRA' : 'A' }));
  return { parts };
}

/** The F7 / F8 select of a wide RAM's positions: { A: 'AX' | null, C: 'CX' | null, B: 'BX' | null } by the pair. */
const f7Select = p => (p === 'A' || p === 'B' ? 'AX' : 'CX');

/**
 * The site pins of an input pin of a memory cell (an array: an address bit goes to every position that reads it),
 * [] when the pin has none. ps: its positions; konst(n): the net's constant (0 / 1) or null.
 */
export function memInPins(c, ps, pin, n, konst) {
  const t = c.type, [name, bit] = bitOf(pin);
  const k = konst(n);
  if (SRL_TYPE.test(t)) {
    const p = ps[0];
    if (name === 'D') return [t === 'SRLC32E' ? `${p}X` : `${p}I`];
    if (name === 'CLK') return k === null ? ['CLK'] : [];
    if (name === 'CE') return k === 1 ? [] : ['CE'];
    if (name === 'A') return [`${p}${bit + 2}`];
    return [];
  }
  if (name === 'WCLK') return k === null ? ['CLK'] : [];
  if (name === 'WE') return k === 1 ? [] : ['CE'];
  const { parts } = memLayout(c, ps);
  if (t === 'RAM32M' || t === 'RAM64M') {
    const m = /^(ADDR|DI)([A-D])$/.exec(name);
    if (!m) return [];
    if (m[1] === 'ADDR') return [`${m[2]}${bit + 1}`];
    return [t === 'RAM32M' && bit === 1 ? `${m[2]}I` : `${m[2]}X`];
  }
  const shift = depth(t) === 32 ? 2 : 1;
  if (name === 'D') return [dataPin(parts)];
  const port = name === 'A' ? 'w' : name === 'DPRA' ? 'r' : null;
  if (port === null || bit === null) return [];
  const mine = parts.filter(q => q.port === port);
  if (bit < 6) return mine.map(q => `${q.p}${bit + shift}`);
  // the 7th bit: the F7s' select of the port's pairs (and WA7, CX, for the write port); the 8th: the F8's (BX)
  if (bit === 6) {
    const sel = [...new Set(mine.map(q => f7Select(q.p)))];
    return port === 'w' && !sel.includes('CX') ? [...sel, 'CX'] : sel;
  }
  return bit === 7 ? ['BX'] : [];
}

// a RAM's data in: DX when the cell takes D, else the bypass input of its first position (the next LUT's DI1)
function dataPin(parts) {
  const w = parts.filter(q => q.port === 'w').map(q => q.p);
  return w.includes('D') ? 'DX' : `${w[0]}X`;
}

/**
 * The constant site pins a memory cell needs: [[site pin, 0 | 1]] (a 32-bit RAM's A1 low in the 64-bit mode, a
 * 32-bit pair's A6 high, a shift register's A1 high and A6 high (16-bit), the write enable tied).
 */
export function memConstPins(c, ps, konst) {
  const t = c.type, out = [];
  if (SRL_TYPE.test(t)) {
    out.push([`${ps[0]}1`, 1]);
    if (t !== 'SRLC32E') out.push([`${ps[0]}6`, 1]);
    // (SRL16 has no CE: tied high, as ISE ties it)
    if (konst(c.pins.CE ?? 1) !== null) out.push(['CE', konst(c.pins.CE ?? 1)]);
    // (a constant address bit: tied as the pin's net)
    for (const [pin, n] of Object.entries(c.pins)) { const [name, bit] = bitOf(pin); if (name === 'A' && konst(n) !== null) out.push([`${ps[0]}${bit + 2}`, konst(n)]); }
    return out;
  }
  if (konst(c.pins.WE ?? 1) !== null) out.push(['CE', konst(c.pins.WE ?? 1)]);
  if (t === 'RAM32M') for (const p of ps) out.push([`${p}6`, 1]);
  else if (depth(t) === 32) for (const p of ps) out.push([`${p}1`, 0]);
  for (const [pin, n] of Object.entries(c.pins)) {
    if (konst(n) === null || c.dirs[pin.replace(/<\d+>$/, '')] === 'output' || /^(WE|WCLK)$/.test(pin)) continue;
    for (const sp of memInPins(c, ps, pin, n, () => null)) out.push([sp, konst(n)]);
  }
  return out;
}

/** The site pin of an output pin of a memory cell (null: none). */
export function memOutPin(c, ps, pin) {
  const t = c.type, [name, bit] = bitOf(pin);
  if (SRL_TYPE.test(t)) {
    if (pin === 'Q') return ps[0];
    return ps[0] === 'A' ? 'DMUX' : null;   // Q15, Q31: the A LUT's cascade, by DMUX only
  }
  if (t === 'RAM32M' || t === 'RAM64M') {
    const m = /^DO([A-D])$/.exec(name);
    return m ? (t === 'RAM32M' && bit === 0 ? `${m[1]}MUX` : m[1]) : null;
  }
  const { parts } = memLayout(c, ps);
  const port = name === 'DPO' ? 'r' : 'w';
  const mine = parts.filter(q => q.port === port);
  if (mine.length === 1) return mine[0].p;
  if (mine.length === 2) return `${f7Out(mine)}MUX`;
  return 'BMUX';
}
// the F7 of a pair of positions: F7AMUX (A, B) out on AMUX, F7BMUX (C, D) on CMUX
const f7Out = pair => (pair.some(q => q.p === 'A' || q.p === 'B') ? 'A' : 'C');

/** The positions of a memory cell in its slice: D first. */
export const memPositions = (s, ci) => [...POS].reverse().filter(p => s.pos[p].o6 === ci);
