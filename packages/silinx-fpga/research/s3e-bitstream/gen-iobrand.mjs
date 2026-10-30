// The IOB registers of a design routed by ISE at random settings (#44): every variant gives every I/O
// register of the design (IFF1/2, OFF1/2, TFF1/2) a random initial value, set or reset, synchronous or
// not, inverted or not clock / enable / set-reset / data (--delays: every input register a random
// input delay, IFD_DELAY_VALUE, every direct input a random IBUF_DELAY_VALUE): only the settings of
// pins the design uses, nothing that changes the routing. ana-iobreg.mjs solves the bits of every setting
// from them (per pad).
//   node gen-iobrand.mjs routed.xdl outdir [N=24] [seed=1] [--delays | --delays-rot]
// (--delays: also the input delays at random, IFD_DELAY_VALUE 0-6 / IBUF_DELAY_VALUE 0-12, written as
// ISE's map writes each value: setDelay)
import fs from 'node:fs';

const argv = process.argv.slice(2);
const delays = argv.includes('--delays');
// --delays-rot: the delays not at random but rotated: in variant v, the k-th I/O site's value is
// (k + v) (every value on every pad in 13 variants), the other settings at random
const rotate = argv.includes('--delays-rot');
const [src, out, Ns = '24', seeds = '1'] = argv.filter(a => !/^--delays/.test(a));
let seed = +seeds;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const pick = a => a[Math.floor(rnd() * a.length)];
// a setting -> the values it may take (only where the design already sets it)
export const TOGGLES = {
  IFF1_INIT_ATTR: ['INIT0', 'INIT1'], IFF2_INIT_ATTR: ['INIT0', 'INIT1'], OFF1_INIT_ATTR: ['INIT0', 'INIT1'], OFF2_INIT_ATTR: ['INIT0', 'INIT1'], TFF1_INIT_ATTR: ['INIT0', 'INIT1'], TFF2_INIT_ATTR: ['INIT0', 'INIT1'],
  IFF1_SR_ATTR: ['SRLOW', 'SRHIGH'], IFF2_SR_ATTR: ['SRLOW', 'SRHIGH'], OFF1_SR_ATTR: ['SRLOW', 'SRHIGH'], OFF2_SR_ATTR: ['SRLOW', 'SRHIGH'], TFF1_SR_ATTR: ['SRLOW', 'SRHIGH'], TFF2_SR_ATTR: ['SRLOW', 'SRHIGH'],
  IFFATTRBOX: ['SYNC', 'ASYNC'], OFFATTRBOX: ['SYNC', 'ASYNC'], TFFATTRBOX: ['SYNC', 'ASYNC'],
  ICLK1INV: ['ICLK1', 'ICLK1_B'], ICLK2INV: ['ICLK2', 'ICLK2_B'], OTCLK1INV: ['OTCLK1', 'OTCLK1_B'], OTCLK2INV: ['OTCLK2', 'OTCLK2_B'],
  ICEINV: ['ICE', 'ICE_B'], OCEINV: ['OCE', 'OCE_B'], TCEINV: ['TCE', 'TCE_B'], SRINV: ['SR', 'SR_B'], REVINV: ['REV', 'REV_B'],
  O1INV: ['O1', 'O1_B'], O2INV: ['O2', 'O2_B'], T1INV: ['T1', 'T1_B'], T2INV: ['T2', 'T2_B'],
};
/** An I/O site's cfg with its input delay set as ISE's map writes it (xdl's DRC wants the delay
 *  elements that go with the value): an input register's IFD_DELAY_VALUE 0-6 (value % 7), a direct
 *  input's IBUF_DELAY_VALUE 0-12 (0: the delay line bypassed; from PRE_IFD / PRE_IBUF on, the
 *  PRE_DELAY element too). Other sites unchanged. */
export function setDelay(cfg, value) {
  const name = (/(?:^|\s)PAD:([^:\s]*):/.exec(cfg) || [])[1] || 'pad';
  const set = (c, attr, v) => (new RegExp(`(^|\\s)${attr}:`).test(c) ? c.replace(new RegExp(`(^|\\s)${attr}:(?:\\\\.|[^\\s])*`), (s, sp) => (v === null ? sp : `${sp}${attr}:${v}`)) : v === null ? c : `${c} ${attr}:${v} `);
  let c = cfg;
  if (/(^|\s)IFF1:[^\s]*:#FF/.test(c) || /(^|\s)IFFDMUX::1/.test(c)) {
    const v = value % 7;
    c = set(c, 'IFD_DELAY_VALUE', `:DLY${v}`);
    c = set(c, 'IFFDELMUX', v ? ':0' : ':1');
    c = set(c, 'PRE_DELAY_MUX', v === 0 ? null : v >= PRE_IFD ? ':1' : ':0');
    c = set(c, 'IFD_DELAY', v ? `${name}.IFD_DELAY:` : null);
    c = set(c, 'PRE_DELAY', v >= PRE_IFD ? `${name}.PRE_DELAY:` : null);
  } else if (/(^|\s)IMUX::1/.test(c)) {
    const v = value % 13;
    c = set(c, 'IBUF_DELAY_VALUE', v ? `:DLY${v}` : ':#OFF');
    c = set(c, 'IDELMUX', v ? ':0' : ':1');
    c = set(c, 'PRE_DELAY_MUX', v === 0 ? null : v >= PRE_IBUF ? ':1' : ':0');
    c = set(c, 'IBUF_DELAY', v ? `${name}.IBUF_DELAY:` : null);
    c = set(c, 'PRE_DELAY', v >= PRE_IBUF ? `${name}.PRE_DELAY:` : null);
  }
  return c;
}
// the first IFD_DELAY_VALUE / IBUF_DELAY_VALUE with the PRE_DELAY element (ISE's map writes 7 and 8
// of IFD_DELAY_VALUE as 0)
export const PRE_IFD = 5, PRE_IBUF = 8;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const text = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/BASE.xdl`, text);
  const re = /(inst "[^"]*" "(?:IOB|IBUF)",placed \S+ \S+\s*,\s*cfg ")([^"]*)(")/g;
  for (let v = 0; v < +Ns; v++) {
    let k = 0;
    const t = text.replace(re, (m, a, cfg, b) => {
      let c = cfg;
      for (const [attr, vals] of Object.entries(TOGGLES)) {
        const r = new RegExp(`(^|\\s)${attr}::(\\S+)`);
        const x = r.exec(c);
        if (!x || x[2] === '#OFF') continue;
        c = c.replace(r, (s, sp) => `${sp}${attr}::${pick(vals)}`);
      }
      if (delays) c = setDelay(c, Math.floor(rnd() * 13));
      else if (rotate) c = setDelay(c, k + v);
      k++;
      return a + c + b;
    });
    fs.writeFileSync(`${out}/V${String(v).padStart(2, '0')}.xdl`, t);
  }
  console.log(`${Ns} variants`);
}
