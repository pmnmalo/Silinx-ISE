// Silinx - the logic analyzer's host side (#3176): the scans the PC sends to the capture core (core/ila.js) through
// the JTAG user register, the status word read back, a readout read into a capture (each probe's samples, oldest
// first, the trigger's sample at index `pre`), and a capture replayed as a test bench of its own, whose simulation has
// the probes' waves the waveform viewer draws (the same viewer as a simulation's, the probes' names and buses).
//
// A scan shifts the register's R bits in (the command in its two low bits, shifted first) while its R bits come out;
// the core runs a scan's command at the next scan's capture, so the word a scan reads out is the previous scan's:
// arming is [arm, status] (the second reads the status with the new arm toggle), and a readout is
// [rewind, read x depth, status], whose words are the status, the status again (the rewind's), then the samples. The
// core's flags cross to the JTAG clock on its edges, which come only during a scan (a BSCAN's DRCK): a status reads
// them as the previous scan left them, so the PC polls (status scans) until one reads the capture complete.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   CAPTURE_CMD                    { status, arm, read, rewind }: the commands' codes
//   scanWord(spec, cmd)            the R-bit word a scan shifts in (a BigInt)
//   readStatus(spec, word)         { armed, triggered, done, arm, ack, complete, depth, width, matches }
//   readoutCommands(spec)          the commands of a readout
//   readCapture(spec, words)       the readout's words -> { samples, probes: { name: [BigInt] }, trigger, errors }
//   replayBench(spec, capture, { lang, period })   the capture as a module of signals, one sample per period (ps)

import { planCapture } from './ila.js';

export const CAPTURE_CMD = { status: 0, arm: 1, read: 2, rewind: 3 };

/** The word a scan of `cmd` shifts in (its R bits, least significant first). */
export function scanWord(spec, cmd) {
  if (!Object.values(CAPTURE_CMD).includes(cmd)) throw new Error(`no capture command ${cmd}`);
  return BigInt(cmd);
}

/** The status word a scan read: its flags, the core's shape (matches: the shape of the spec's core). */
export function readStatus(spec, word) {
  const w = BigInt(word), bit = k => Number((w >> BigInt(k)) & 1n);
  const plan = planCapture(spec);
  const depth = 2 ** Number((w >> 5n) & 31n), width = Number((w >> 10n) & 255n) + 1;
  const s = { armed: !!bit(0), triggered: !!bit(1), done: !!bit(2), arm: bit(3), ack: bit(4), depth, width };
  return { ...s, complete: s.done && s.arm === s.ack, matches: !plan.errors.length && depth === +spec.depth && width === plan.width };
}

/** A readout's commands: the read address to the oldest sample, a read per sample, a status to read the last one. */
export function readoutCommands(spec) {
  return [CAPTURE_CMD.rewind, ...Array(+spec.depth).fill(CAPTURE_CMD.read), CAPTURE_CMD.status];
}

/**
 * A readout's words (those of readoutCommands' scans) read into a capture: { samples (the sample words, oldest
 * first), probes ({ name: [values] }, each probe's bits of the words), trigger (the trigger's sample, index pre),
 * status (readStatus' of the first word), errors }.
 */
export function readCapture(spec, words) {
  const plan = planCapture(spec);
  const out = { samples: [], probes: {}, trigger: +spec.pre, status: null, errors: [...plan.errors] };
  if (out.errors.length) return out;
  const D = +spec.depth;
  if (words.length !== D + 2) { out.errors.push(`A readout is ${D + 2} words: ${words.length} read.`); return out; }
  const st = out.status = readStatus(spec, words[0]);
  if (!st.matches) out.errors.push(`The board's core is not this capture's: ${st.width} bit(s) x ${st.depth} samples, not ${plan.width} x ${D}.`);
  else if (!st.complete) out.errors.push(st.arm !== st.ack ? 'The capture is not armed yet.' : st.triggered ? 'The capture is not done: it has triggered, the samples after the trigger are coming.' : 'The capture is not done: its trigger has not come.');
  if (out.errors.length) return out;
  const mask = (1n << BigInt(plan.width)) - 1n;
  out.samples = words.slice(2).map(x => BigInt(x) & mask);
  for (const p of spec.probes) {
    const [lo, hi] = plan.slices[p.name], m = (1n << BigInt(hi - lo + 1)) - 1n;
    out.probes[p.name] = out.samples.map(x => (x >> BigInt(lo)) & m);
  }
  return out;
}

/**
 * A capture as a module of its own (`<name>_replay`, no ports): a signal per probe, given its samples one per
 * `period` picoseconds (the capture clock's), the trigger's at pre x period. Its simulation's waves are the capture's.
 */
export function replayBench(spec, capture, { lang = spec.lang, period = 20000 } = {}) {
  const v = lang === 'verilog', name = `${spec.name}_replay`, D = capture.samples.length;
  const ws = spec.probes.map(p => +p.width);
  const lit = (x, w) => (v ? `${w}'b${x.toString(2).padStart(w, '0')}` : w === 1 ? `'${x}'` : `"${x.toString(2).padStart(w, '0')}"`);
  const steps = [];
  for (let k = 0; k < D; k++) {
    const ch = spec.probes.map((p, i) => [p.name, capture.probes[p.name][k], ws[i]]).filter(([n, x]) => k === 0 || capture.probes[n][k - 1] !== x);
    steps.push(ch.map(([n, x, w]) => (v ? `${n} = ${lit(x, w)};` : `${n} <= ${lit(x, w)};`)).join(' '));
  }
  const head = `Capture of ${spec.name} (Silinx, #3176): ${D} samples, one per ${period} ps, the trigger at ${capture.trigger * period} ps.`;
  if (v) {
    return ['`timescale 1ps / 1ps', `// ${head}`, `module ${name};`,
      ...spec.probes.map((p, i) => `  reg ${ws[i] > 1 ? `[${ws[i] - 1}:0] ` : ''}${p.name} = ${lit(0n, ws[i])};`),
      // (a sample with no change: the delay alone, `#…;`, a statement of its own, #3340)
      '  initial begin', ...steps.map((s, k) => `    ${k ? `#${period}${s ? ' ' : ';'}` : ''}${s}`.trimEnd()), '  end', 'endmodule', ''].join('\n');
  }
  return [`-- ${head}`, 'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', '', `entity ${name} is`, `end ${name};`, '', `architecture capture of ${name} is`,
    ...spec.probes.map((p, i) => `  signal ${p.name} : ${ws[i] > 1 ? `std_logic_vector(${ws[i] - 1} downto 0) := (others => '0')` : "std_logic := '0'"};`),
    'begin', '  process', '  begin',
    ...steps.map((s, k) => `    ${k ? `wait for ${period} ps; ` : ''}${s}`.trimEnd()), '    wait;', '  end process;', 'end capture;', ''].join('\n');
}
