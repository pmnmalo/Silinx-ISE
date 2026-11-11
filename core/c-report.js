// Silinx HLS's report and options (out of web/js/c-source.js, #2674, so that the server reports them too): the clock,
// the delays and the multiplier blocks a C function is scheduled for (the board's, the device's), and the lines of
// View C Synthesis Report from core/c-hdl.js's report (the module, its ports, its states and registers, its
// processes, functions, memories, loops and multipliers) with its warnings.
import { periodNs, deviceFamily, resourceCount } from '../packages/silinx-fpga/src/parts.js';
import { familyProfile } from './family-profile.js';
import { familyOf } from './c-timing.js';

/** The clock Silinx HLS schedules a C function for (#1924): the period, in ns, of the board's oscillator (b: its record), else
 *  20 ns (50 MHz). */
export function hlsClockOf(b) {
  const r = b?.resources?.find((x) => x.group === 'Clock' && x.extra?.period);
  return (r && periodNs(r.extra.period)) || 20;
}

/** The delays Silinx HLS schedules with (#2080): those of the device's family (core/c-timing.js), else the
 *  Artix-7's. */
export function hlsFamilyOf(device) {
  return familyOf(device ? deviceFamily(device) : null);
}

/** The multiplier blocks a cycle may take (#2125): the device's, else no limit. part: the device's part record
 *  (server/devices.js findPart, S.devices.parts; #2783: resourceCount needs the record, not the part's name). */
export function hlsMultsOf(device, part) {
  if (!device?.part || !part) return null;
  // (the family's multiplier, #2310; a family with no profile: the Spartan-3 generation's MULT18X18)
  try { return resourceCount(part, familyProfile(deviceFamily(device)).multiplier || 'mult18x18') || null; } catch { return null; }
}

/** View C Synthesis Report's lines of cToHdl's result `r` (path: the C source, lang: the HDL's, clock: ns), and its
 *  warnings (the multipliers' or a pipelined loop's path over the clock): { lines, warnings }. */
export function cReportLines(r, { path, lang, clock }) {
  const rep = r.report;
  const L = [`C Synthesis Report of '${r.top}' (${path}, ${lang === 'vhdl' ? 'VHDL' : 'Verilog'})`, ''];
  // (ap_ctrl_none: no ap_start / ap_done / ap_idle / ap_ready, #1900)
  const ctrl = r.ports.some((p) => p.name === 'ap_continue') ? 'ap_ctrl_chain (ap_clk, ap_rst, ap_start / ap_done / ap_continue / ap_idle / ap_ready)' : r.ports.some((p) => p.name === 'ap_start') ? 'ap_ctrl_hs (ap_clk, ap_rst, ap_start / ap_done / ap_idle / ap_ready)' : 'ap_ctrl_none (ap_clk, ap_rst: running by itself)';
  if (rep.dataflow) L.push(`Module: DATAFLOW, ${ctrl}, ${rep.processes.length} processes running at once`);
  else L.push(rep.sequential ? `Module: sequential, ${ctrl}, ${rep.states} states, ${rep.registerBits} register bits` : r.ports.some((p) => p.name === 'ap_continue') ? `Module: combinational, ${ctrl}` : 'Module: combinational');
  // (the clock it was scheduled for: the board's, #1924)
  L.push(`Target clock: ${clock} ns (the board's oscillator)`);
  for (const b of r.blackboxes || []) L.push(`RTL blackbox: ${b.name} is the module ${b.module} (${b.rtl.map((f) => f.path.split('/').pop()).join(', ')})`);
  L.push('', 'Ports:');
  for (const p of r.ports) L.push(`  ${p.name.padEnd(16)} ${p.dir === 'in' ? 'in ' : 'out'} ${String(p.w).padStart(3)} bit${p.w > 1 ? 's' : ''}`);
  const cycles = (x) => (x.max === null ? `at least ${x.min} cycles` : x.min === x.max ? `${x.max} cycles` : `${x.min}-${x.max} cycles`);
  // (DATAFLOW, #1707: each process a module, the FIFOs between them)
  if (rep.dataflow) {
    L.push('', 'Processes:');
    // (the region's latency and interval, each process's, #1706)
    L[L.length - 1] = `Processes (the region's latency: ${cycles(rep.latency)}; its interval: ${cycles(rep.interval)}):`;
    // (an RTL blackbox's process: its module, its latency the description's or its ap_done's, #2340)
    for (const p of rep.processes) L.push(`  ${p.instance.padEnd(16)} ${p.name}: ${p.blackbox ? `the RTL blackbox ${p.blackbox}, ${p.latency.max === null ? 'ended by its ap_done' : `latency ${cycles(p.latency)}`}` : `${p.states} states, ${p.registerBits} register bits${p.latency ? `, latency ${cycles(p.latency)}` : ''}`}${p.after.length ? `; starts once ${p.after.join(', ')} ${p.after.length > 1 ? 'are' : 'is'} done` : ''}`);
    if (rep.fifos.length) { L.push('', 'FIFOs:'); for (const f of rep.fifos) L.push(`  ${f.name.padEnd(16)} ${f.depth} words`); }
  }
  // (a function not inlined, a sub-module: its calls, its latency and resources, #1960)
  if (rep.functions?.length) {
    L.push('', `Functions (the module's latency: ${cycles(rep.latency)}):`);
    for (const f of rep.functions) L.push(`  ${f.instance.padEnd(16)} ${f.name}${f.of ? `, in ${f.of}` : ''}: ${f.calls} call${f.calls > 1 ? 's' : ''}; ${f.sequential ? `latency ${cycles(f.latency)}, ${f.states} states, ${f.registerBits} register bits${f.memories ? `, ${f.memories} memor${f.memories > 1 ? 'ies' : 'y'}` : ''}` : 'combinational'}`);
  }
  if (rep.memories?.length) { L.push('', 'Memories:'); for (const m of rep.memories) L.push(`  ${m.name.padEnd(16)} ${m.words} x ${m.bits} bits, ${m.kind === 'ap_memory' ? 'ap_memory (outside the module)' : m.kind === 'ROM' ? 'a ROM (block RAM)' : m.kind === 'RAM (PIPO)' ? 'a buffer between processes (block RAM)' : 'a RAM (block RAM)'}`); }
  if (rep.loops?.length) {
    L.push('', 'Loops:');
    for (const l of rep.loops) {
      const made = [l.unroll === 'whole' ? 'unrolled' : l.unroll ? `unrolled by ${l.unroll}` : null, l.pipeline ? (l.auto ? 'pipelined automatically, as Vitis HLS does' : `pipelined, II=${l.pipeline} asked`) : null].filter(Boolean).join(', ');
      const count = l.trip !== null ? `${l.trip} iterations` : l.max !== null ? `up to ${l.max} iterations` : 'iterations unknown';
      L.push(`  ${l.name ? `${l.name} (line ${l.line})` : `line ${String(l.line).padEnd(4)}`} ${count}; ${l.unroll === 'whole' ? 'in the state it is in' : `II=${l.ii}`}${l.depth > 1 ? ` (an iteration over ${l.depth} cycles)` : ''}${l.cycles !== null ? `, ${l.cycles} cycles` : ''}${made ? `; ${made}` : ''}`);
    }
  }
  if (rep.units?.length) {
    // (the multiplications of different states bound to one unit, #2125)
    L.push('', `Multipliers: ${rep.units.length} unit${rep.units.length > 1 ? 's' : ''}, ${rep.blocks} multiplier block${rep.blocks > 1 ? 's' : ''}`);
    for (const [k, u] of rep.units.entries()) L.push(`  mul_${k}`.padEnd(18) + `${u.a} x ${u.b} bits, ${u.blocks} block${u.blocks > 1 ? 's' : ''}; ${u.uses} use${u.uses > 1 ? 's' : ''}, ${u.inputs} input${u.inputs > 1 ? 's' : ''} multiplexed`);
  }
  const warnings = [];
  if (rep.unitsNs > clock) warnings.push(`WARNING:SilinxC - "${path}": the multipliers' multiplexers make a path of about ${rep.unitsNs.toFixed(1)} ns, over the ${clock} ns clock (their operands held in registers where that makes it shorter, #2273): a slower clock makes it fit`);
  // (a pipelined loop too slow for the clock that Silinx cannot make in stages, its accesses a state each: its II kept,
  // #2080; the others' iteration over several cycles, #2182)
  for (const l of rep.slowLoops || []) warnings.push(`WARNING:SilinxC - "${path}" line ${l.line}: this pipelined loop's iteration does not fit the ${clock} ns clock: a path of about ${l.ns.toFixed(1)} ns in one cycle (its accesses a state each: Silinx adds no pipeline stages to it); a slower clock, or #pragma HLS PIPELINE off, makes it fit`);
  return { lines: L, warnings };
}
