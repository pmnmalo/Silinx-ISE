// Silinx - the logic analyzer's capture inserted in a design (#3176): a project's capture settings (silinx.json
// `capture`: the signals to watch by their path in the design, the clock, the depth, the samples before the trigger,
// the trigger) resolved on the elaborated design (each probe's signal and width), and the sources Implement adds to
// the design's: the capture core (core/ila.js) and a wrapper around the top. The wrapper has the top's ports (the
// constraints apply to it unchanged), instantiates the top as `dut`, reads the probes and the clock through
// hierarchical names (dut.u_count.q: the design's own sources are not changed) and connects the core to the family's
// BSCAN primitive (BSCAN_SPARTAN3's USER1, BSCAN_SPARTAN6's and BSCANE2's JTAG_CHAIN 1). The wrapper is Verilog
// whatever the design's language (a hierarchical name is Verilog's), which reads a VHDL design's signals as well.
//
// settings: { clock, depth, pre, probes: ['count', 'u_ctl.state', …], trigger: { combine: 'and' | 'or',
//   conditions: [{ probe, op, value }] } }: a condition's probe is one of `probes`, its value a number (a string:
//   decimal, 0x…, 0b…; a negative number for a signed integer; an enumeration's literal for a state)
//
//   planInsertion(design, settings, { family })   { probes: [{ path, name, width, kind }], clock, spec, plan, errors }
//   captureSources(design, settings, { family, lang, link })   { sources: [core, wrapper], top, plan, errors }
//   captureFrontEnd(frontEnd, settings, { family })   the open flow's front end (core/synth-front.js flowFrontEnd)
//     with the capture inserted
// link 'ports' (for tests): the wrapper's JTAG side as ports of its own (tck, sel, capture, shift, tdi, tdo) in place
// of the BSCAN, so a test bench plays the PC's part.
//
// Isomorphic ES module (browser + Node), no DOM.

import { captureModule, planCapture } from './ila.js';
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';

export const CAPTURE_TOP = 'silinx_capture_top';
export const CAPTURE_CORE = 'silinx_capture';
// the BSCAN of each family: its cell, its parameters, its pins for tck, sel, capture, shift, tdi, tdo
const BSCAN = {
  spartan3e: { cell: 'BSCAN_SPARTAN3', params: '', pins: ['DRCK1', 'SEL1', 'CAPTURE', 'SHIFT', 'TDI', 'TDO1'], tie: ['TDO2'] },
  spartan6: { cell: 'BSCAN_SPARTAN6', params: ' #(.JTAG_CHAIN(1))', pins: ['DRCK', 'SEL', 'CAPTURE', 'SHIFT', 'TDI', 'TDO'], tie: [] },
  artix7: { cell: 'BSCANE2', params: ' #(.JTAG_CHAIN(1))', pins: ['DRCK', 'SEL', 'CAPTURE', 'SHIFT', 'TDI', 'TDO'], tie: [] },
};
const LINK = ['tck', 'sel', 'capture', 'shift', 'tdi', 'tdo'];
export const CAPTURE_FAMILIES = Object.keys(BSCAN);

const bitsOf = n => { let k = 1; while ((1n << BigInt(k)) <= n) k++; return k; };
// a signal's bits as a probe (an integer: its range's; an enumeration: its encoding's), or null (an array, a real…)
function probeWidth(t) {
  if (['logic', 'bool', 'enum', 'bit'].includes(t.kind)) return t.w;
  if (t.kind === 'int') {
    if (t.rlo === undefined) return 32;
    return t.rlo < 0 ? Math.max(bitsOf(BigInt(-t.rlo - 1)), bitsOf(BigInt(t.rhi))) + 1 : bitsOf(BigInt(t.rhi));
  }
  return null;
}
const KIND = { logic: 'a vector', int: 'an integer', enum: 'a state', bool: 'a boolean', bit: 'a vector' };

// a design's signal by its path below the top ("count", "u_ctl.state", "g[1].q"; the top's name before it allowed),
// in the design's case (VHDL's names are lower case)
function findSignal(design, path) {
  const top = design.top.path;
  const rel = String(path ?? '').trim().replace(new RegExp(`^${top}\\.`, 'i'), '');
  const want = `${top}.${rel}`.toLowerCase();
  return rel ? design.signals.find(s => s.path.toLowerCase() === want) || null : null;
}
// a probe's name in the core: its path, dots and brackets as underscores
const probeName = path => path.replace(/[.[\]]+/g, '_').replace(/_+$/, '').replace(/^_+/, '') || 'p';

// a condition's value as a number of the probe's bits: an enumeration's literal, a negative integer's bits
function valueOf(c, probe) {
  if (c.value === undefined || c.value === null || c.value === '') return c.value;
  if (probe.names && typeof c.value === 'string') {
    const i = probe.names.findIndex(n => n.toLowerCase() === c.value.trim().toLowerCase());
    if (i >= 0) return i;
  }
  let v;
  try { v = BigInt(typeof c.value === 'string' ? c.value.trim() : c.value); } catch { return c.value; }
  if (probe.signed && v < 0n) v += 1n << BigInt(probe.width);
  // (a number when it is one exactly, else its decimal digits: the settings are JSON, in the core's header line)
  return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= 0n ? Number(v) : String(v);
}

/** A capture's settings on an elaborated design: each probe's signal and width, the core's spec and plan, the errors. */
export function planInsertion(design, settings, { family = 'spartan3e', lang = 'verilog' } = {}) {
  const errors = [];
  const s = settings || {};
  if (!BSCAN[family]) errors.push(`The logic analyzer has no JTAG link on the ${family} yet.`);
  const probes = [], names = new Set();
  for (const path of Array.isArray(s.probes) ? s.probes : []) {
    const sig = findSignal(design, path);
    if (!sig) { errors.push(`The probe '${path}' is not a signal of the design (a signal's path below the top: count, u_ctl.state).`); continue; }
    const width = probeWidth(sig.t);
    if (!width) { errors.push(`The probe '${path}' is ${sig.t.kind === 'array' ? 'an array (a memory)' : `of type ${sig.t.kind}`}: a probe is a vector, an integer, a state or a bit.`); continue; }
    const rel = sig.path.slice(design.top.path.length + 1);
    if (probes.some(p => p.path === rel)) { errors.push(`The probe '${path}' is given twice.`); continue; }
    let name = probeName(rel), k = 1;
    while (names.has(name.toLowerCase())) name = `${probeName(rel)}_${k++}`;
    names.add(name.toLowerCase());
    probes.push({ path: rel, name, width, kind: KIND[sig.t.kind], signed: sig.t.kind === 'int' && sig.t.rlo < 0, ...(sig.t.kind === 'enum' && { names: sig.t.names }) });
  }
  if (!(Array.isArray(s.probes) && s.probes.length)) errors.push('A capture watches one signal or more (probes).');
  const clk = s.clock ? findSignal(design, s.clock) : null;
  if (!s.clock) errors.push('A capture needs the clock it samples on (clock).');
  else if (!clk) errors.push(`The clock '${s.clock}' is not a signal of the design.`);
  else if (probeWidth(clk.t) !== 1 || clk.t.kind === 'int') errors.push(`The clock '${s.clock}' is not a signal of one bit.`);
  const byPath = new Map(probes.map(p => [p.path.toLowerCase(), p]));
  const conditions = [];
  // (the trigger checked once the probes are: a condition on a probe in error would be said twice)
  for (const c of errors.length ? [] : s.trigger?.conditions || []) {
    const sig = findSignal(design, c.probe);
    const p = sig && byPath.get(sig.path.slice(design.top.path.length + 1).toLowerCase());
    if (!p) { errors.push(`The trigger's signal '${c.probe}' is not one of the capture's probes.`); continue; }
    conditions.push({ probe: p.name, op: c.op, ...(c.value !== undefined && { value: valueOf(c, p) }) });
  }
  const spec = { wizard: 'capture', version: 1, name: CAPTURE_CORE, lang, family, depth: s.depth, pre: s.pre ?? 0,
    probes: probes.map(p => ({ name: p.name, width: p.width })), trigger: { combine: s.trigger?.combine ?? 'and', conditions } };
  // (the core's own errors, its probes' left out (said above), a probe named by its path)
  const plan = planCapture(spec);
  const byName = n => probes.find(p => p.name === n)?.path ?? n;
  if (probes.length) errors.push(...plan.errors.filter(e => !/^(Probe |A capture watches)/.test(e)).map(e => e.replace(/'(\w+)'/g, (m, n) => `'${byName(n)}'`)));
  return { probes, clock: clk ? clk.path.slice(design.top.path.length + 1) : null, spec, plan, errors };
}

// a Verilog name: escaped when it is not a plain identifier or is a keyword
const VKEY = /^(always|and|assign|begin|buf|case|default|else|end|endmodule|for|function|if|initial|inout|input|integer|module|nand|nor|not|or|output|parameter|reg|wire|xor|xnor|logic|bit|byte|int|signed|unsigned|edge|event|task|time|real|table|begin|fork|join|wait|while|repeat|force|release|supply0|supply1|tri|specify|primitive)$/;
const vname = n => (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(n) && !VKEY.test(n) ? n : `\\${n} `);
const vpath = path => path.split('.').map(seg => { const m = /^([^[]+)((?:\[\d+\])*)$/.exec(seg); return m ? vname(m[1]) + m[2] : vname(seg); }).join('.');
const range = t => (t.scalar || t.w === 1 && t.left === t.right && !t.mark ? '' : `[${t.left}:${t.right}] `);

function wrapperOf(design, ins, family, link) {
  const top = design.top, b = BSCAN[family];
  const ports = top.ports.map(p => `  ${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} wire ${range(p.sig.t)}${vname(p.sig.name)}`);
  const own = link === 'ports' ? ['  input wire tck', '  input wire sel', '  input wire capture', '  input wire shift', '  input wire tdi', '  output wire tdo'] : [];
  const W = ins.plan.width;
  const lines = [
    `// Silinx - the logic analyzer's capture (#3176) around the top '${top.module}': its ports, the top as dut, the`,
    `// probes read through hierarchical names, the core ${CAPTURE_CORE} on the JTAG${link === 'ports' ? ' (its link as ports, for a test bench)' : ` through ${b.cell}`}.`,
    '// Generated at Implement from the project\'s capture settings: not one of the project\'s sources.',
    `module ${CAPTURE_TOP} (`,
    [...ports, ...own].join(',\n'),
    ');',
    `  ${vname(top.module)} dut (${top.ports.map(p => `.${vname(p.sig.name)}(${vname(p.sig.name)})`).join(', ')});`,
    ...ins.probes.map((p, i) => `  wire [${p.width - 1}:0] silinx_p${i};\n  assign silinx_p${i} = dut.${vpath(p.path)};   // ${p.path}`),
    `  wire [${W - 1}:0] silinx_probe = {${ins.probes.map((p, i) => `silinx_p${i}`).reverse().join(', ')}};`,
  ];
  if (link !== 'ports') {
    lines.push('  wire tck, sel, capture, shift, tdi, tdo;');
    const pins = b.pins.map((pin, i) => `.${pin}(${LINK[i]})`);
    lines.push(`  ${b.cell}${b.params} silinx_bscan (${[...pins, ...b.tie.map(t => `.${t}(1'b0)`)].join(', ')});`);
  }
  lines.push(`  ${CAPTURE_CORE} silinx_ila (.clk(dut.${vpath(ins.clock)}), .probe(silinx_probe), .tck(tck), .sel(sel), .capture(capture), .shift(shift), .tdi(tdi), .tdo(tdo));`);
  lines.push('endmodule', '');
  return lines.join('\n');
}

/**
 * The sources a capture adds to an elaborated design: [the core (in `lang`), the wrapper (Verilog)], the wrapper's
 * name as the top, the core's plan and the probes; errors (planInsertion's) and no sources when it has them.
 */
export function captureSources(design, settings, { family = 'spartan3e', lang = 'verilog', link = 'bscan' } = {}) {
  const ins = planInsertion(design, settings, { family, lang });
  if (ins.errors.length) return { sources: [], top: null, ...ins };
  const core = captureModule(ins.spec);
  const ext = lang === 'verilog' ? 'v' : 'vhd';
  return { ...ins, top: CAPTURE_TOP, sources: [
    { path: `capture/${CAPTURE_CORE}.${ext}`, lang, text: core.code },
    { path: `capture/${CAPTURE_TOP}.v`, lang: 'verilog', text: wrapperOf(design, ins, family, link) },
  ] };
}

/**
 * The open flow's front end with the capture inserted: frontEnd(srcs, top) (core/synth-front.js flowFrontEnd) given
 * the design's sources and the wrapper; the design elaborated first for the probes' signals. Its result has
 * `capture` (captureSources's probes and plan) besides { errors, input }.
 */
export function captureFrontEnd(frontEnd, settings, { family = 'spartan3e' } = {}) {
  return (srcs, top, opts) => {
    let design;
    try {
      const lib = compile([...primitiveSources(srcs), ...srcs]);
      design = elaborate(lib, top);
      const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
      if (errs.length) return frontEnd(srcs, top, opts);
    } catch { return frontEnd(srcs, top, opts); }
    const c = captureSources(design, settings, { family });
    if (c.errors.length) return { errors: c.errors.map(e => `capture: ${e}`), input: () => null, capture: c };
    return { ...frontEnd([...srcs, ...c.sources], c.top, opts), capture: c };
  };
}

/**
 * A capture's block RAMs against the device's: { blocks (planMemory's), halves (the 9 Kbit halves on the Spartan-6,
 * the blocks on the Spartan-3E), total (the device's, in the same unit), errors }; one block is kept for the design
 * (a capture takes at most total - 1, on the Spartan-6 total - 2 halves). total: the device's RAMB16 (Spartan-3E) or
 * RAMB8BWER (Spartan-6) count, null when unknown (no check).
 */
export function captureCost(plan, total) {
  const m = plan.memory;
  const out = { blocks: m?.blocks ?? 0, halves: m?.halves ?? 0, total: total ?? null, errors: [] };
  if (!m || total == null) return out;
  const s6 = m.family === 'spartan6', keep = s6 ? 2 : 1;
  const unit = n => (s6 ? `${n} 9 Kbit block RAM half(s)` : `${n} block RAM(s)`);
  if (m.halves > total - keep) out.errors.push(`The capture takes ${unit(m.halves)} of the device's ${total}: at most ${total - keep}, one block kept for the design (fewer samples or fewer probes).`);
  return out;
}
