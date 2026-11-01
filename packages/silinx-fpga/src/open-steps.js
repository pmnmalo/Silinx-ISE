// The steps of a run of the Silinx toolchain, in their order (#404): one rule for the server
// (server/open-flow.js openSteps) and the browser edition (web/js/open-flow-browser.js browserSteps),
// which only name the steps their own way (aliases) and say their own errors.

/** The Xilinx families' steps (#2387), as a back end lists its own (open-flow-backends.js): { id, label (the processes
 *  tree's), needs (the steps it depends on) }, in the order runFlow runs them; ISE's names. */
export const XILINX_STEPS = [
  { id: 'synth', label: 'Synthesize - Yosys', needs: [] },
  { id: 'postsynth', label: 'Generate Post-Synthesis Simulation Model', needs: [] },   // (its own synthesis, with the test bench's generics)
  { id: 'translate', label: 'Translate', needs: ['synth'] },
  { id: 'posttrans', label: 'Generate Post-Translate Simulation Model', needs: ['translate'] },
  { id: 'map', label: 'Map', needs: ['translate'] },
  { id: 'postmap', label: 'Generate Post-Map Simulation Model', needs: ['map'] },
  { id: 'par', label: 'Place & Route', needs: ['map'] },
  { id: 'trce', label: 'Generate Post-Place & Route Static Timing', needs: ['par'] },
  { id: 'postpar', label: 'Generate Post-Place & Route Simulation Model', needs: ['par'] },
  { id: 'pin2ucf', label: 'Back-annotate Pin Locations', needs: ['par'] },
  { id: 'xpwr', label: 'Generate Text Power Report', needs: ['par'] },
  { id: 'bitgen', label: 'Generate Programming File', needs: ['par'] },
  { id: 'prombit', label: 'Generate PROM File', needs: ['par'] },
  { id: 'fpgaview', label: 'View Implemented Design (FPGA)', needs: ['par'] },
];

/** The steps of a back end's list (XILINX_STEPS' shape) a run needs for the steps asked: those and what they need, in the
 *  list's order (none asked: the whole list); a step the list does not have throws. */
export function orderSteps(list, asked = []) {
  const byId = new Map(list.map(s => [s.id, s]));
  const set = new Set();
  const add = id => {
    if (set.has(id)) return;
    if (!byId.has(id)) throw new Error(`no step ${id} (the steps: ${list.map(s => s.id).join(', ')})`);
    set.add(id);
    for (const n of byId.get(id).needs || []) add(n);
  };
  for (const id of asked.length ? asked : list.map(s => s.id)) add(id);
  return list.map(s => s.id).filter(id => set.has(id));
}

/** The chain of the implementation: a run is the chain up to the last step asked for. */
export const OPEN_CHAIN = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'];
/** Every step the Silinx toolchain has (ISE's: every step of the flow, since the Post-Place & Route model, #122). */
export const OPEN_STEPS = ['synth', 'postsynth', 'translate', 'posttrans', 'map', 'postmap', 'par', 'trce', 'postpar', 'pin2ucf', 'xpwr', 'bitgen', 'prombit', 'fpgaview'];

/**
 * The steps of a run, in their order, from the steps asked for (names of OPEN_STEPS; none: the whole
 * chain): the chain from the synthesis to the last one asked for (from Translate on when the synthesis
 * is up to date and not asked for, #280), Place & Route with its timing, the bitstream with the PROM's;
 * the post-synthesis model after the synthesis (#120), the post-translate and post-map models after Translate
 * and Map (#121), the post-place & route model after the timing (#122); the pins of the placement (#118) and the power
 * estimate (#123) after the timing, before the bitstream; the FPGA view last.
 */
export function orderOpenSteps(steps, { synthUpToDate = false } = {}) {
  const set = new Set(steps);
  if (!set.size) OPEN_CHAIN.forEach(s => set.add(s));
  if (set.has('par')) set.add('trce');
  if (set.has('bitgen')) set.add('prombit');
  if (set.has('posttrans')) set.add('translate');
  if (set.has('postmap')) set.add('map');
  const asked = Math.max(-1, ...[...set].map(s => OPEN_CHAIN.indexOf(s)));
  // the steps that need the placement: the chain to Place & Route and its timing at least
  const placed = ['postpar', 'pin2ucf', 'xpwr', 'fpgaview'].some(s => set.has(s));
  const last = placed ? Math.max(asked, OPEN_CHAIN.indexOf('trce')) : asked;
  // (the chain is made first, the other steps put into it after: counting them as chain steps left
  // gaps and repeats, #404: ['postsynth', 'fpgaview'] had no synthesis)
  const out = OPEN_CHAIN.slice(synthUpToDate && !set.has('synth') && asked > 0 ? 1 : 0, last + 1);
  // (the model may be synthesized again with the test bench's generics: after the synthesis when it runs)
  if (set.has('postsynth')) out.splice(out.includes('synth') ? 1 : 0, 0, 'postsynth');
  if (set.has('posttrans')) out.splice(out.indexOf('translate') + 1, 0, 'posttrans');
  if (set.has('postmap')) out.splice(out.indexOf('map') + 1, 0, 'postmap');
  if (set.has('postpar')) out.splice(out.indexOf('trce') + 1, 0, 'postpar');
  if (set.has('pin2ucf')) out.splice(out.indexOf(out.includes('postpar') ? 'postpar' : 'trce') + 1, 0, 'pin2ucf');
  if (set.has('xpwr')) out.splice(out.indexOf(out.includes('pin2ucf') ? 'pin2ucf' : out.includes('postpar') ? 'postpar' : 'trce') + 1, 0, 'xpwr');
  if (set.has('fpgaview')) out.push('fpgaview');
  return out;
}

/** A project's place and route engine (its impl.engine, Process Properties, #2136): 'silinx', 'nextpnr' or 'auto' (nextpnr
 *  when it can implement the design, else Silinx's); 'auto' when not set: nextpnr by default (#2136). */
export const engineOf = impl => (['silinx', 'nextpnr', 'auto'].includes(impl?.engine) ? impl.engine : 'auto');
