// #3, the sites' pins: observation designs that use every pin of the sites the open flow places (block RAM, multiplier,
// DCM, the I/O blocks), implemented by ISE from HDL (impl-remote.sh); prototype.mjs observe reads each pin's tile wire from
// ISE's routes. A sink pin is read only when it is its net's one sink in its tile, so every pin has a signal of its own:
// a bit of one long shift register (s), fed from the inputs, every output into an XOR of registers.
//   ramwide:   every block RAM (LOC'd) a RAMB16_S36_S36: every data and parity bit, both ports' controls
//   ramnarrow: every block RAM a RAMB16_S1_S1: the 14 address bits of each port
//   multcasc:  the multipliers in cascade chains up each column (B_INPUT CASCADE: BCIN), every register, enable and reset
//   dcmpins:   the four DCMs (LOC'd), variable phase shift: every output, LOCKED, PSDONE, STATUS 0-2 (3-7 lead
//              nowhere: par finds them unrouteable), the inputs
//   iobddr:    every pad (LOC'd) but the clock: an IDDR2 (set and reset), and on the pads that can drive an ODDR2 for the
//              data and one for the tristate (IOBUF), each with its enable, set and reset
//   iobclk2-k: the pads at position k of their I/O tile (k = 0, 1, 2) an IDDR2 on a DCM's CLK0 and CLK180 (and an ODDR2
//              on CLK0 and CLK90 where they can drive): ICLK2 and OTCLK2 each its net's one sink in the tile (iobddr's second
//              clock, the first inverted, is the same net as ICLK1's)
//   PART=xc3s250ecp132-4 node gen-obspins.mjs outdir [--clk pad]     (folders ramwide, ramnarrow, multcasc, dcmpins, iobddr,
//                                                                     iobclk2-0, -1, -2)
//   PART=xc3s250eft256-4 node gen-obspins.mjs outdir --pads obs.json   the I/O designs on the pads of another package's
//                                                                     observation (the FT256: the I/O sites the CP132
//                                                                     leaves without a pad; the die's description, PART's)
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../../packages/silinx-fpga/src/fpga/place.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';
const sitesOf = (dev, type) => dev.sites(type).map(s => s.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const xy = s => s.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);

/** The clock pad of a DCM design: the first bonded pad of the top I/O tile in the column of the top edge's first DCM, so
 *  that pad and DCM are in one quadrant (ISE refuses another pair: Place:1012). B8 on the XC3S250E; the XC3S100E's top DCM
 *  is right of the centre, B9. */
export function dcmClockPad(dev) {
  const dcms = dev.sites('DCM').map(s => ({ s, at: xy(s.name) }));
  const top = Math.max(...dcms.map(d => d.at[1]));
  const { s } = dcms.filter(d => d.at[1] === top).sort((a, b) => a.at[0] - b.at[0])[0];
  const col = dev.tileCol[s.tile];
  for (let t = 0; t < dev.tileCount; t++)
    if (dev.tileRow[t] === 1 && dev.tileCol[t] === col) {
      const pad = (dev.tileSites[t] || []).find(([, b]) => b === 1);
      if (pad) return pad[0];
    }
  throw new Error(`gen-obspins: no bonded pad above ${s.name} (column ${col})`);
}

/** The device's pads: [{ name, tile, inputOnly, pos }], pos the pad's place among its tile's I/O sites. */
export function devicePads(dev) {
  return [...deviceSites(dev).pads.values()].map(p => {
    const k = dev.tileIndex.get(p.tile), types = dev.templates[dev.tileTemplate[k]].sites;
    return { name: p.name, tile: p.tile, inputOnly: p.inputOnly, pos: dev.tileSites[k].filter(([n], i) => /^(IOB|IBUF|DIFF)/.test(types[i].type)).findIndex(([n]) => n === p.name) };
  });
}

/** The pads of an observation's design (prototype.mjs observe), for another package of the die (the FT256): [{ name, tile,
 *  inputOnly, pos }], each pad whose input ISE routed (pos from its I pin's wire, Ik_PINWIRE: the k-th I/O site of its
 *  tile, the rule every pin of the CP132 follows; input-only: the IBUFS tiles). */
export function observedPads(obs) {
  const out = new Map();
  for (const p of obs.pins) {
    const m = p.pin === 'I' && p.dir === 'o' && /^I(\d)_PINWIRE$/.exec(p.wire);
    if (m && /IOIS|IBUFS/.test(p.tile)) out.set(p.site, { name: p.site, tile: p.tile, inputOnly: /IBUFS/.test(p.tile), pos: +m[1] });
  }
  return [...out.values()];
}

/** A design around n distinct signals s[0…n-1] (a shift register fed from the inputs d) and m results r (XORed into q). */
export function wrap(part, what, n, ports, body, results, pre = '') {
  return `// ${part}: ${what} (#3, the sites' pins: research/s3e-device gen-obspins.mjs)
module top(input clk, input [7:0] d${ports}, output reg [7:0] q);
${pre}  reg [${n - 1}:0] s = 0;
  always @(posedge clk) s <= {s[${n - 9}:0], d};
${body}
  always @(posedge clk) begin
${Array.from({ length: 8 }, (_, k) => `    q[${k}] <= ${results.filter((r, i) => i % 8 === k).join(' ^ ') || "1'b0"};`).join('\n')}
  end
endmodule
`;
}

/** Every block RAM a RAMB16_S36_S36 (wide) or RAMB16_S1_S1 (narrow), every pin on a signal of its own: { v, ucf }. */
export function ram(dev, wide, part = PART) {
  const rams = sitesOf(dev, 'RAMB16');
  const [prim, aw, dw, pw] = wide ? ['RAMB16_S36_S36', 9, 32, 4] : ['RAMB16_S1_S1', 14, 1, 0];
  const per = 2 * (aw + dw + pw + 3);   // ADDR, DI, DIP, WE, EN, SSR of each port
  let k = 0;
  const sig = w => { const a = k; k += w; return w === 1 ? `s[${a}]` : `s[${a + w - 1}:${a}]`; };
  const res = [];
  const body = rams.map((s, i) => {
    const port = p => `.CLK${p}(clk), .ADDR${p}(${sig(aw)}), .DI${p}(${sig(dw)}),${pw ? ` .DIP${p}(${sig(pw)}),` : ''} .WE${p}(${sig(1)}), .EN${p}(${sig(1)}), .SSR${p}(${sig(1)}), .DO${p}(o${i}${p})${pw ? `, .DOP${p}(p${i}${p})` : ''}`;
    for (const p of ['A', 'B']) { res.push(`^o${i}${p}`); if (pw) res.push(`^p${i}${p}`); }
    return `  wire [${dw - 1}:0] o${i}A, o${i}B;${pw ? ` wire [${pw - 1}:0] p${i}A, p${i}B;` : ''}
  ${prim} u${i} (${port('A')},
    ${port('B')});`;
  }).join('\n');
  return { v: wrap(part, `every block RAM a ${prim}, every pin used`, rams.length * per + 8, '', body, res), ucf: rams.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n' };
}

/** The multipliers in cascade chains up each column (the lowest DIRECT, the others CASCADE), every register, enable and
 *  reset on a signal of its own: { v, ucf }. */
export function multCascade(dev, part = PART) {
  const ms = sitesOf(dev, 'MULT18X18SIO').sort((a, b) => xy(a)[0] - xy(b)[0] || xy(a)[1] - xy(b)[1]);
  let k = 0;
  const sig = w => { const a = k; k += w; return w === 1 ? `s[${a}]` : `s[${a + w - 1}:${a}]`; };
  const res = [];
  const body = ms.map((s, i) => {
    const below = ms.findIndex(t => xy(t)[0] === xy(s)[0] && xy(t)[1] === xy(s)[1] - 1);
    res.push(`^p${i}`);
    return `  wire [35:0] p${i}; wire [17:0] bc${i};
  MULT18X18SIO #(.AREG(1), .BREG(1), .PREG(1), .B_INPUT("${below < 0 ? 'DIRECT' : 'CASCADE'}")) u${i} (.CLK(clk), .CEA(${sig(1)}), .CEB(${sig(1)}), .CEP(${sig(1)}),
    .RSTA(${sig(1)}), .RSTB(${sig(1)}), .RSTP(${sig(1)}), .A(${sig(18)}), .B(${below < 0 ? sig(18) : "18'd0"}), .BCIN(${below < 0 ? "18'd0" : `bc${below}`}), .P(p${i}), .BCOUT(bc${i}));`;
  }).join('\n');
  return { v: wrap(part, 'the multipliers in cascade chains, every pin used', k + 8, '', body, res), ucf: ms.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n' };
}

/** The four DCMs (LOC'd), variable phase shift, each output, LOCKED, PSDONE and STATUS 0-2 into the logic, the inputs on
 *  signals of their own: { v, ucf }. */
export function dcmPins(dev, part = PART) {
  const dcms = sitesOf(dev, 'DCM');
  const OUT = ['CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180', 'LOCKED', 'PSDONE'];
  const res = [];
  const body = dcms.map((s, i) => {
    const o = OUT.map(p => `.${p}(${p.toLowerCase()}${i})`).join(', ');
    res.push(...OUT.map(p => `${p.toLowerCase()}${i}`), `st${i}[0]`, `st${i}[1]`, `st${i}[2]`);
    return `  wire c0_${i}, fb${i}, ${OUT.map(p => `${p.toLowerCase()}${i}`).join(', ')}; wire [7:0] st${i};
  DCM_SP #(.CLKIN_PERIOD(20.0), .CLK_FEEDBACK("1X"), .CLKOUT_PHASE_SHIFT("VARIABLE"), .CLKDV_DIVIDE(2.0), .CLKFX_MULTIPLY(2), .CLKFX_DIVIDE(1))
    u${i} (.CLKIN(ck), .CLKFB(fb${i}), .RST(s[${5 * i}]), .PSEN(s[${5 * i + 1}]), .PSINCDEC(s[${5 * i + 2}]), .PSCLK(ck), .DSSEN(s[${5 * i + 3}]),
    .CLK0(c0_${i}), ${o}, .STATUS(st${i}));
  BUFG u_fb${i} (.I(c0_${i}), .O(fb${i}));`;
  }).join('\n');
  const v = wrap(part, 'the four DCMs, variable phase shift, every pin used', 5 * dcms.length + 8, '', body, res, '  wire ck;\n  BUFG u_ck (.I(clk), .O(ck));\n')
    .replace(/always @\(posedge clk\)/g, 'always @(posedge ck)');
  return { v, ucf: dcms.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n' };
}

/** Every pad but the clock, the eight inputs and the eight outputs (LOC'd): an IDDR2 (set and reset), on the pads that can drive an ODDR2
 *  for the data and one for the tristate, every pin on a signal of its own: { v, ucf }. alt: the inputs and outputs on the
 *  first pads that can drive instead (iobddr-b), so that the two designs together give every pad its DDR registers (the
 *  XC3S100E's input-only pads and last pads, which only the default leaves out: G12's IQ2, SR, REV, ICE). */
export function iobDdr(dev, clkPin = 'B8', part = PART, padList = devicePads(dev), { alt = false } = {}) {
  const pads = padList.filter(p => p.name !== clkPin).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  // (the eight inputs d: input-only pads first, then the last pads; the eight outputs q: the last pads left; alt: both on
  // the first pads that can drive)
  const drive = pads.filter(p => !p.inputOnly);
  const dPads = alt ? drive.slice(0, 8) : [...pads.filter(p => p.inputOnly), ...drive.slice().reverse()].slice(0, 8);
  const qPads = alt ? drive.slice(8, 16) : drive.filter(p => !dPads.includes(p)).reverse().slice(0, 8);
  const use = pads.filter(p => !dPads.includes(p) && !qPads.includes(p));
  const ins = use.filter(p => p.inputOnly), ios = use.filter(p => !p.inputOnly);
  let k = 0;
  const sig = () => `s[${k++}]`;
  const res = [];
  // (an IOB has one set / reset and one REV, its registers share them: each pad's R and S once)
  const iddr = (pin, i, r, s) => { res.push(`q0${i}`, `q1${i}`); return `  wire q0${i}, q1${i};
  IDDR2 #(.DDR_ALIGNMENT("NONE"), .SRTYPE("SYNC")) ui${i} (.D(${pin}), .C0(ck), .C1(ckn), .CE(${sig()}), .R(${r}), .S(${s}), .Q0(q0${i}), .Q1(q1${i}));`; };
  const oddr = (name, q, i, r, s) => `  ODDR2 #(.DDR_ALIGNMENT("NONE"), .SRTYPE("SYNC")) ${name}${i} (.D0(${sig()}), .D1(${sig()}), .C0(ck), .C1(ckn), .CE(${sig()}), .R(${r}), .S(${s}), .Q(${q}));`;
  const body = [
    ...ins.map((p, i) => iddr(`a[${i}]`, `a${i}`, sig(), sig())),
    ...ios.map((p, i) => { const r = sig(), s = sig(); return `  wire bi${i}, bo${i}, bt${i};
  IOBUF ub${i} (.IO(b[${i}]), .I(bo${i}), .T(bt${i}), .O(bi${i}));
${oddr('uo', `bo${i}`, i, r, s)}
${oddr('ut', `bt${i}`, i, r, s)}
${iddr(`bi${i}`, `b${i}`, r, s)}`; }),
  ].join('\n');
  const v = wrap(part, 'every pad an IDDR2, and an ODDR2 for the data and one for the tristate where it can drive, every pin used', k + 8,
    `, input [${ins.length - 1}:0] a, inout [${ios.length - 1}:0] b`, body, res, '  wire ck, ckn;\n  BUFG u_ck (.I(clk), .O(ck));\n  assign ckn = ~ck;\n')
    .replace(/always @\(posedge clk\)/g, 'always @(posedge ck)');
  const loc = [['clk', clkPin], ...dPads.map((p, i) => [`d<${i}>`, p.name]), ...qPads.map((p, i) => [`q<${i}>`, p.name]), ...ins.map((p, i) => [`a<${i}>`, p.name]), ...ios.map((p, i) => [`b<${i}>`, p.name])];
  return { v, ucf: loc.map(([n, p]) => `NET "${n}" LOC = "${p}" ;`).join('\n') + '\n' };
}

/** The pads at position k of their I/O tile (but the clock, the eight inputs and the eight outputs), each an IDDR2 on a
 *  DCM's CLK0 (C0) and CLK180 (C1), and an ODDR2 on CLK0 and CLK90 where it can drive: { v, ucf }. */
export function iobClk2(dev, k, clkPin = 'B8', part = PART, padList = devicePads(dev)) {
  const all = padList.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const pos = new Map(all.map(p => [p.name, p.pos]));
  const pads = all.filter(p => p.name !== clkPin);
  const dPads = [...pads.filter(p => p.inputOnly), ...pads.filter(p => !p.inputOnly).reverse()].slice(0, 8);
  const qPads = pads.filter(p => !p.inputOnly && !dPads.includes(p)).reverse().slice(0, 8);
  const use = pads.filter(p => !dPads.includes(p) && !qPads.includes(p) && pos.get(p.name) === k);
  let n = 0;
  const sig = () => `s[${n++}]`;
  const res = [];
  const body = use.map((p, i) => {
    res.push(`q0${i}`, `q1${i}`);
    const iddr = `  IDDR2 #(.DDR_ALIGNMENT("NONE")) ui${i} (.D(${p.inputOnly ? `a[${i}]` : `bi${i}`}), .C0(ck0), .C1(ck180), .CE(1'b1), .R(1'b0), .S(1'b0), .Q0(q0${i}), .Q1(q1${i}));`;
    if (p.inputOnly) return `  wire q0${i}, q1${i};\n${iddr}`;
    return `  wire q0${i}, q1${i}, bi${i}, bo${i};
  IOBUF ub${i} (.IO(a[${i}]), .I(bo${i}), .T(1'b0), .O(bi${i}));
  ODDR2 #(.DDR_ALIGNMENT("NONE")) uo${i} (.D0(${sig()}), .D1(${sig()}), .C0(ck0), .C1(ck90), .CE(1'b1), .R(1'b0), .S(1'b0), .Q(bo${i}));
${iddr}`;
  }).join('\n');
  const pre = `  wire ci, c0, c90, c180, ck0, ck90, ck180;
  IBUFG u_ci (.I(clk), .O(ci));
  DCM_SP #(.CLKIN_PERIOD(20.0), .CLK_FEEDBACK("1X")) u_dcm (.CLKIN(ci), .CLKFB(ck0), .RST(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0), .PSCLK(1'b0), .DSSEN(1'b0), .CLK0(c0), .CLK90(c90), .CLK180(c180));
  BUFG u_b0 (.I(c0), .O(ck0));
  BUFG u_b90 (.I(c90), .O(ck90));
  BUFG u_b180 (.I(c180), .O(ck180));
`;
  // (each pad an inout here, the input-only ones read only: a[i])
  const v = wrap(part, `the pads at position ${k} of their I/O tile an IDDR2 / ODDR2 on two clocks (ICLK2, OTCLK2)`, n + 9, `, inout [${use.length - 1}:0] a`, body, res, pre)
    .replace(/always @\(posedge clk\)/g, 'always @(posedge ck0)');
  const loc = [['clk', clkPin], ...dPads.map((p, i) => [`d<${i}>`, p.name]), ...qPads.map((p, i) => [`q<${i}>`, p.name]), ...use.map((p, i) => [`a<${i}>`, p.name])];
  return { v, ucf: loc.map(([nm, pd]) => `NET "${nm}" LOC = "${pd}" ;`).join('\n') + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ci = args.indexOf('--clk'), clkArg = ci >= 0 ? args.splice(ci, 2)[1] : null;
  const pi = args.indexOf('--pads'), padsObs = pi >= 0 ? JSON.parse(fs.readFileSync(args.splice(pi, 2)[1], 'utf8')) : null;
  const [out] = args;
  const dev = padsObs ? null : loadDeviceCache(PART);
  // (--pads obs.json: only the I/O designs, on that observation's pads: another package, PART naming it)
  const pads = padsObs ? observedPads(padsObs) : devicePads(dev);
  // (iobddr has no DCM: B8; iobclk2's clock goes through one: the pad above it)
  const clkPin = clkArg || 'B8', dcmClk = clkArg || (dev ? dcmClockPad(dev) : 'B8');
  const io = [['iobddr', () => iobDdr(dev, clkPin, PART, pads)], ['iobddr-b', () => iobDdr(dev, clkPin, PART, pads, { alt: true })], ...[0, 1, 2].map(k => [`iobclk2-${k}`, () => iobClk2(dev, k, dcmClk, PART, pads)])];
  const done = [];
  for (const [name, f] of padsObs ? io : [['ramwide', () => ram(dev, true)], ['ramnarrow', () => ram(dev, false)], ['multcasc', () => multCascade(dev)], ['dcmpins', () => dcmPins(dev)], ...io]) {
    const { v, ucf } = f();
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    fs.writeFileSync(`${out}/${name}/top.v`, v);
    fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
    done.push(name);
  }
  console.log(`${PART}: ${done.join(', ')}`);
}
