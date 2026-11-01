// Silinx toolchain - a family's synthesis by a Yosys script of its own (#2386): the flat Verilog read, the family's
// commands (its synth_*, its cells' library), the netlist written as synth-open.js writes it (outputs: the JSON, the
// Verilog, the statistics). A back end without a synthesis of its own (synth-open.js synthesizeVerilog for the Xilinx
// families) is given one: scriptSynthesis({ script }) is synthesizeVerilog's signature and result, without its mappings.
import { cellCounts, outputs } from './synth-open.js';
import { asText } from './synth-open-yosys.js';

/** Yosys's generic cells counted as the Design Summary's resources: its LUTs ($lut), flip-flops, latches and the rest. */
export function genericUtilization(counts) {
  const sum = re => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
  return { luts: sum(/^\$lut$/), flipFlops: sum(/^\$_(S?DFFE?|DFFSRE?|ALDFFE?)_/), latches: sum(/^\$_(DLATCH|SR)_/), ios: 0, cells: sum(/./) };
}

/**
 * The synthesis of a script: script(top) -> the Yosys commands after the flat module is read (e.g. `synth -flatten -top
 * ${top}`); files: what the script reads besides ({ name: text }); utilization(counts): the resources of the netlist's
 * cells (genericUtilization); quiet: the RegExps of Yosys's messages that say nothing about the design. Returns
 * async (input, { run, onLine }) -> { top, files, cells, util, warnings, log }.
 */
export function scriptSynthesis({ script, files = {}, utilization = genericUtilization, quiet = [] }) {
  if (typeof script !== 'function') throw new Error('a synthesis script needs script(top)');
  return async (input, { run, onLine = () => {} } = {}) => {
    const { text, top, warnings = [] } = input;
    const log = [];
    const out = await run(['-q', '-p', `read_verilog -sv ${top}_syn.v; ${script(top)}; ${outputs(top)}`], { ...files, [`${top}_syn.v`]: text },
      l => { if (!quiet.some(re => re.test(l))) { log.push(l); onLine(l); } });
    const json = asText(out[`${top}.json`]);
    const cells = cellCounts(json, top);
    return {
      top, cells, util: utilization(cells), log, warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l))],
      files: { [`${top}_syn.v`]: text, [`${top}.json`]: json, [`${top}_yosys.v`]: asText(out[`${top}_yosys.v`]), [`${top}_stat.txt`]: asText(out[`${top}_stat.txt`]) },
    };
  };
}
