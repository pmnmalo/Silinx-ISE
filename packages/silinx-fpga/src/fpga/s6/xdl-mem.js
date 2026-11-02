// Silinx - the SLICEM's distributed RAMs and shift registers as XDL (#1153, xdl.js): their LUTs' contents and modes,
// the data multiplexers, the write address's 7th and 8th bits and the write enable as ISE's map writes them (one
// design of each kind implemented by ISE, research/s6/gen-mem6.mjs) (browser + Node).
//
//   <p>6LUT  #RAM:O6=0x<16 hex digits>: the cell's INIT, 64 bits a position (a wide RAM: the 64 addresses its
//            position holds, the F7's HIGH in A / C, LOW in B / D; RAM256X1S's quarters D, C, B, A); a 32-bit RAM in
//            the 64-bit mode: address k at bit 2k (A1 low); a RAM32M's DO<1> (its INIT's odd bits) in both halves (A6
//            high) and its DO<0> (the even bits) in <p>5LUT #RAM:O5=0x<8 digits>; a shift register's INIT as it is
//   <p>6RAMMODE  SPRAM64 / DPRAM64 / DPRAM32 (and <p>5RAMMODE), SRL16 / SRL32
//   <p>DI1MUX    a position's data: its own bypass input (AX …), DX (B, C: the D LUT's data), BDI1 (A: B's)
//   WA7USED, WA8USED, WEMUX::CE
import { paramBits } from '../netlist.js';
import { SRL_TYPE, memLayout, memPositions } from './phys-mem.js';

const depth = type => +(/^RAM(\d+)/.exec(type)?.[1] ?? 0);
// bits (least significant first) as hex digits, most significant first
const hex = bits => { let s = ''; for (let i = bits.length / 4 - 1; i >= 0; i--) s += (bits[4 * i] | bits[4 * i + 1] << 1 | bits[4 * i + 2] << 2 | bits[4 * i + 3] << 3).toString(16).toUpperCase(); return `0x${s}`; };
const initOf = (c, name, n) => { const b = paramBits(c.params[name]) || []; return Array.from({ length: n }, (_, i) => b[i] || 0); };

/** The contents of a memory cell's LUT in position p: { o6: '0x…', o5: '0x…' | null }. */
export function memContents(c, ps, p) {
  const t = c.type;
  if (SRL_TYPE.test(t)) return { o6: hex([...initOf(c, 'INIT', t === 'SRLC32E' ? 32 : 16), ...Array(t === 'SRLC32E' ? 32 : 48).fill(0)]), o5: null };
  if (t === 'RAM64M') return { o6: hex(initOf(c, `INIT_${p}`, 64)), o5: null };
  if (t === 'RAM32M') {
    const b = initOf(c, `INIT_${p}`, 64), odd = b.filter((_, i) => i & 1), even = b.filter((_, i) => !(i & 1));
    return { o6: hex([...odd, ...odd]), o5: hex(even) };
  }
  const n = depth(t), b = initOf(c, 'INIT', n);
  if (n === 32) return { o6: hex(Array.from({ length: 64 }, (_, i) => (i & 1 ? 0 : b[i >> 1]))), o5: null };
  const half = memLayout(c, ps).parts.find(q => q.p === p).half;
  return { o6: hex(b.slice(64 * half, 64 * half + 64)), o5: null };
}

/** The mode of a memory cell's LUT ({ o6, o5 }: <p>6RAMMODE, <p>5RAMMODE). */
function memMode(c) {
  const t = c.type;
  if (SRL_TYPE.test(t)) return { o6: t === 'SRLC32E' ? 'SRL32' : 'SRL16', o5: null };
  if (t === 'RAM32M') return { o6: 'DPRAM32', o5: 'DPRAM32' };
  return { o6: /X1D$|^RAM64M$/.test(t) ? 'DPRAM64' : 'SPRAM64', o5: null };
}

// a position's data multiplexer (A, B, C; D has none): the cell's data from its own bypass input, the D LUT's (DX),
// or B's (BDI1)
function di1(c, ps, p) {
  const t = c.type;
  if (p === 'D' || /^(SRL16E?|SRLC16E)$/.test(t)) return null;
  if (t === 'SRLC32E' || t === 'RAM32M' || t === 'RAM64M') return `${p}X`;
  if (ps.includes('D')) return p === 'A' ? 'BDI1' : 'DX';
  return p === 'A' && ps.includes('B') ? 'BDI1' : `${p}X`;
}

/** The settings of a memory cell's position p: its LUTs, their mode and data multiplexer. name: the slice's. */
export function memPosCfg(c, s, ci, p, put) {
  const ps = memPositions(s, ci), k = memContents(c, ps, p), mode = memMode(c);
  const lutName = ps.length > 1 ? `${c.name}/${p}` : c.name;
  put(`${p}6LUT`, lutName, `#RAM:O6=${k.o6}`);
  put(`${p}6RAMMODE`, '', mode.o6);
  if (k.o5) { put(`${p}5LUT`, `${lutName}5`, `#RAM:O5=${k.o5}`); put(`${p}5RAMMODE`, '', mode.o5); } else put(`${p}5LUT`, '', '#OFF');
  const mux = di1(c, ps, p);
  if (mux) put(`${p}DI1MUX`, '', mux);
}

/** The slice-wide settings of a SLICEM with RAMs or shift registers: the write enable, WA7 / WA8. */
export function memSliceCfg(cells, s, put) {
  const types = new Set(['A', 'B', 'C', 'D'].map(p => s.pos[p].o6).filter(x => typeof x === 'number').map(ci => cells[ci].type));
  put('WEMUX', '', 'CE');
  if ([...types].some(t => depth(t) > 64)) put('WA7USED', '', '0');
  if (types.has('RAM256X1S')) put('WA8USED', '', '0');
}
