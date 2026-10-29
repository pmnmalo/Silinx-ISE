// Silinx toolchain - the packer's block RAMs (#405: out of packWith in core/fpga/pack.js): RAMB16_S<w> and
// RAMB16_S<wa>_S<wb>, their ports' pins and settings as ISE's map writes them.
import { paramBits } from './netlist.js';
import { BRAM_TYPE, BRAM_WIDTH } from './pack.js';

/** { packBram } of packWith. */
export function mountBram(ctx) {
  const {
    ci, hardSite, nets
  } = ctx;

  // Block RAM: RAMB16_S<w> (port A) or RAMB16_S<wa>_S<wb>. A port of w bits uses the address pins
  // ADDR(14 - n) … ADDR13 (n address bits), data DI0…, parity DIP0… (as ISE's map writes it).
  function packBram(c) {
    const m = BRAM_TYPE.exec(c.type);
    const ports = m[3] ? { A: +m[1], B: +m[3] } : { A: +m[1] };
    const single = !m[3];
    parityToData(c, ports, single);
    // the ports never written whose data and parity inputs are all constants (a ROM's): WE tied to 0 (#836)
    const inputsOf = P => Object.keys(c.pins).filter(p => new RegExp(`^DIP?${single ? '' : P}(<\\d+>)?$`).test(p));
    c.unwritten = new Set(Object.keys(ports).filter(P => {
      const we = c.pins[single ? 'WE' : `WE${P}`];
      return we !== undefined && nets[we].const === 0 && inputsOf(P).every(p => nets[c.pins[p]].const !== undefined || c.undriven?.includes(p));
    }));
    const s = hardSite(c, 'bram', 'RAMB16', p => {
      const q = /^(DOP|DIP|DO|DI|ADDR|CLK|EN|SSR|WE)([AB])?(?:<(\d+)>)?$/.exec(p);
      if (!q) return null;
      const port = single ? 'A' : q[2];
      if (!port || ports[port] === undefined) return null;
      const w = BRAM_WIDTH[ports[port]], i = q[3] === undefined ? 0 : +q[3];
      if (q[1] === 'ADDR') return `ADDR${port}${14 - w.addr + i}`;
      if (/^(DO|DI|DOP|DIP)$/.test(q[1])) return `${q[1]}${port}${i}`;
      return `${q[1]}${port}`;
    });
    s.ports = ports;
    s.single = single;
  }
  // A word narrower than the port with a bit in a parity position (Yosys's 18-bit word is DI0-7,
  // DIP0, DI8-15, DIP1: a 14-bit memory writes DIP0 and leaves DI13-15 free): ISE's DRC warns when
  // a port's parity inputs carry a signal and its parity outputs are not read (PhysDesignRules:1060,
  // "The block is configured to use input parity pins. There are dangling output parity pins.").
  // Each such parity bit moves to a data bit no port writes or reads (pins, contents, initial and
  // reset values), as ISE's map lays out the same memory (DI0-13, parity inputs tied to 0): when a
  // port writes a signal into a parity bit it does not read. Ports of the same width only (a
  // parity bit is then the same bit of the memory on both).
  function parityToData(c, ports, single) {
    const widths = [...new Set(Object.values(ports))];
    if (widths.length !== 1 || !BRAM_WIDTH[widths[0]].par) return;
    const w = BRAM_WIDTH[widths[0]];
    const sides = single ? [''] : Object.keys(ports);
    c.params = { ...c.params };   // (the packer's copy of the cell shares them with the netlist)
    const pinName = (base, i, count) => (count > 1 ? `${base}<${i}>` : base);
    const unused = pin => !(pin in c.pins) || (() => { const n = nets[c.pins[pin]]; return n.const === undefined && !n.loads.length && !n.port; })();
    const undriven = pin => !(pin in c.pins) || !!c.undriven?.includes(pin);
    const swapPins = (a, b) => {
      const na = c.pins[a], nb = c.pins[b];
      // (both may be on one net, a constant: the ends are found first, then renamed)
      const ends = [];
      for (const [pin, n, to] of [[a, na, b], [b, nb, a]]) {
        if (n === undefined) continue;
        for (const l of nets[n].loads) if (l.cell === ci(c) && l.pin === pin) ends.push([l, to]);
        if (nets[n].driver?.cell === ci(c) && nets[n].driver.pin === pin) ends.push([nets[n].driver, to]);
      }
      for (const [e, to] of ends) e.pin = to;
      delete c.pins[a]; delete c.pins[b];
      if (nb !== undefined) c.pins[a] = nb;
      if (na !== undefined) c.pins[b] = na;
      if (c.undriven) c.undriven = c.undriven.map(p => (p === a ? b : p === b ? a : p));
    };
    // the memory's contents (INIT_00..3F: data bits, INITP_00..07: parity bits; LSB first)
    const get = k => c.params[k] ?? c.params[k.toLowerCase()] ?? c.params[k.replace(/_([0-9A-F]{2})$/, (_, h) => `_${h.toLowerCase()}`)];
    const words = (prefix, count) => {
      const out = [];
      for (let i = 0; i < count; i++) { const b = paramBits(get(`${prefix}_${i.toString(16).padStart(2, '0').toUpperCase()}`)) || []; for (let j = 0; j < 256; j++) out.push(b[j] || 0); }
      return out;
    };
    const putWords = (prefix, bits) => {
      for (let i = 0; i < bits.length / 256; i++) {
        const k = `${prefix}_${i.toString(16).padStart(2, '0').toUpperCase()}`;
        for (const v of [k, k.toLowerCase(), k.replace(/_([0-9A-F]{2})$/, (_, h) => `_${h.toLowerCase()}`)]) delete c.params[v];
        c.params[k] = bits.slice(i * 256, i * 256 + 256).reverse().join('');
      }
    };
    let data = null, par = null, stuck = false;
    const taken = new Set();
    for (let k = 0; k < w.par; k++) {
      // a port writes a signal into the parity bit and does not read it back (the DRC's case)
      const signal = pin => pin in c.pins && nets[c.pins[pin]].const === undefined;
      if (!sides.some(P => signal(pinName(`DIP${P}`, k, w.par)) && unused(pinName(`DOP${P}`, k, w.par)))) continue;
      let j = -1;
      for (let i = 0; i < w.data && j < 0; i++) if (!taken.has(i) && sides.every(P => undriven(pinName(`DI${P}`, i, w.data)) && unused(pinName(`DO${P}`, i, w.data)))) j = i;
      if (j < 0) { stuck = true; continue; }
      taken.add(j);
      for (const P of sides) {
        swapPins(pinName(`DI${P}`, j, w.data), pinName(`DIP${P}`, k, w.par));
        swapPins(pinName(`DO${P}`, j, w.data), pinName(`DOP${P}`, k, w.par));
        // the initial and reset values of the output latches: data bits, then parity bits
        for (const v of ['INIT', 'SRVAL']) {
          const key = single ? v : `${v}_${P}`;
          if (c.params[key] === undefined) continue;
          const b = paramBits(c.params[key]) || [];
          while (b.length < w.data + w.par) b.push(0);
          [b[j], b[w.data + k]] = [b[w.data + k], b[j]];
          c.params[key] = b.slice(0, w.data + w.par).reverse().join('');
        }
      }
      data ||= words('INIT', 64);
      par ||= words('INITP', 8);
      for (let a = 0; a < 16384 / w.data; a++) [data[a * w.data + j], par[a * w.par + k]] = [par[a * w.par + k], data[a * w.data + j]];
    }
    if (data) { putWords('INIT', data); putWords('INITP', par); }
    // No free data bit (a 2048 x 9 FIFO writing all 9 bits on port A and reading them on port B:
    // PhysDesignRules:1063, "configured to use an input parity pins. There is a dangling output
    // parity pin.", which ISE's own map of the same memory gives too, #550): when the memory uses
    // half the port's words at most (its address MSB tied to 0 on every port), each port becomes
    // twice as wide with half the words, the word on data bits only (parity bit k on data bit
    // data + k), the parity inputs tied to 0 and the parity outputs unused.
    const W = BRAM_WIDTH[2 * widths[0]];
    const msb = P => pinName(`ADDR${P}`, w.addr - 1, w.addr);
    if (!stuck || !W || !sides.every(P => !(msb(P) in c.pins) || nets[c.pins[msb(P)]].const === 0)) return;
    const rename = (from, to) => {
      if (!(from in c.pins)) return;
      const n = c.pins[from];
      for (const e of [...nets[n].loads, nets[n].driver]) if (e?.cell === ci(c) && e.pin === from) e.pin = to;
      delete c.pins[from];
      c.pins[to] = n;
      if (c.undriven) c.undriven = c.undriven.map(p => (p === from ? to : p));
    };
    for (const P of sides) {
      if (msb(P) in c.pins) {
        const n = c.pins[msb(P)];
        nets[n].loads = nets[n].loads.filter(l => !(l.cell === ci(c) && l.pin === msb(P)));
        delete c.pins[msb(P)];
      }
      for (let i = 0; i < w.data; i++) for (const b of ['DI', 'DO']) rename(pinName(`${b}${P}`, i, w.data), pinName(`${b}${P}`, i, W.data));
      for (let k = 0; k < w.par; k++) for (const b of ['DI', 'DO']) rename(pinName(`${b}P${P}`, k, w.par), pinName(`${b}${P}`, w.data + k, W.data));
      // the parity inputs tied to 0 (the DRC wants all of a port's or none: PhysDesignRules:1061)
      for (let k = 0; k < W.par; k++) {
        c.pins[pinName(`DIP${P}`, k, W.par)] = 0;
        nets[0].loads.push({ cell: ci(c), pin: pinName(`DIP${P}`, k, W.par) });
      }
      for (const v of ['INIT', 'SRVAL']) {
        const key = single ? v : `${v}_${P}`;
        if (c.params[key] === undefined) continue;
        const b = (paramBits(c.params[key]) || []).slice(0, w.data + w.par);
        while (b.length < W.data + W.par) b.push(0);
        c.params[key] = b.reverse().join('');
      }
    }
    // the contents: word a of the lower half, its data bits then its parity bits, on word a
    data = words('INIT', 64);
    par = words('INITP', 8);
    const wide = Array(16384).fill(0);
    for (let a = 0; a < 16384 / W.data; a++) {
      for (let i = 0; i < w.data; i++) wide[a * W.data + i] = data[a * w.data + i];
      for (let k = 0; k < w.par; k++) wide[a * W.data + w.data + k] = par[a * w.par + k];
    }
    putWords('INIT', wide);
    putWords('INITP', Array(2048).fill(0));
    for (const P of Object.keys(ports)) ports[P] = 2 * widths[0];
    c.type = c.type.replace(/S\d+/g, `S${2 * widths[0]}`);
  }

  return { packBram };
}
