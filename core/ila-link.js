// Silinx - the logic analyzer's link to the board (#3176): a capture run on the board through the capture core's
// JTAG user register (core/ila.js; the scans and their words: core/ila-capture.js): armed, polled until it is
// complete, then read out into each probe's samples. The link is anything that shifts the register's scans and gives
// back what each read out, link.scan([BigInt]) -> [BigInt], the user instruction (USER1) already in the FPGA's
// instruction register:
//   - in the browser, the Digilent Adept USB of the Basys2 / Nexys2 over WebUSB (core/adept.js): adeptLink(usb);
//   - on the server, adepttool's Python (server/ila-board.js runs scripts/ila-scan.py, the same scans).
// A scan reads out the word of the previous scan's command (ila-capture.js), so arming is [arm, status] (the second
// reads the status with the arm toggle flipped); a poll is a status scan, as many as the trigger takes to come (the
// core's flags cross to the JTAG clock only during a scan); the readout is readoutCommands' scans.
//
// Isomorphic ES module (browser + Node), no DOM.
//
//   const cap = await runCapture(link, spec, { timeoutMs, pollMs, now, sleep, log })
//     cap: readCapture's { samples, probes, trigger, status, errors } and polls (the status scans the trigger took)
//   const link = await adeptLink(usb, spec, { log });  …  await link.close();
//   captureRecord({ top, clock, spec, probes, cap })   the capture as build/capture.json has it
//   captureLinkError(family)   why a capture cannot be read on a board of the family yet, or null
import { CAPTURE_CMD, scanWord, readStatus, readoutCommands, readCapture } from './ila-capture.js';
import { planCapture } from './ila.js';
import { Adept, Djtg, Chain, JtagSeq } from './adept.js';

// the Spartan-3E's USER1 instruction (6 bits, BSCAN_SPARTAN3's DRCK1 / SEL1: UG332), the core's register
export const USER1 = 0x02;

// the families whose boards the links read (the Spartan-3E's Digilent Adept boards; the others' links: #3773)
const LINK_FAMILIES = ['spartan3e'];
/** Why a capture cannot be read on a board of the family (a capture's spec.family) yet, or null. */
export const captureLinkError = family => (LINK_FAMILIES.includes(family || 'spartan3e') ? null
  : 'reading a capture on the board: the Spartan-3E\'s boards only yet (Basys2, Nexys2: their Digilent Adept USB); the others\' JTAG links are to come (#3773)');

const bitsOf = (spec, w) => `${readStatus(spec, w).width} bit(s) x ${readStatus(spec, w).depth} samples`;
const fail = msg => { throw new Error(msg); };

/**
 * A capture on the board: arm (unless arm: false, a capture already armed), poll the status every pollMs until it is
 * complete or timeoutMs has gone by (now, sleep: the clock, for tests), then read it out. The core on the board must be
 * the spec's (its status word's shape): an error says what the board has. Returns readCapture's result and polls.
 */
export async function runCapture(link, spec, { timeoutMs = 10000, pollMs = 50, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), log = () => {}, arm = true } = {}) {
  let st;
  if (arm) {
    const [, after] = await link.scan([scanWord(spec, CAPTURE_CMD.arm), scanWord(spec, CAPTURE_CMD.status)]);
    st = readStatus(spec, after);
    if (!st.matches) fail(`The board's core is not this capture's: ${bitsOf(spec, after)}, not ${planCapture(spec).width} x ${spec.depth}: Implement the design with its capture and program the board again.`);
    log(`Armed: ${spec.depth} samples, ${spec.pre} before the trigger.`);
  }
  const t0 = now();
  let polls = 0;
  for (;;) {
    const [w] = await link.scan([scanWord(spec, CAPTURE_CMD.status)]);
    st = readStatus(spec, w);
    polls++;
    if (!st.matches) fail(`The board's core is not this capture's: ${bitsOf(spec, w)}, not ${planCapture(spec).width} x ${spec.depth}.`);
    if (st.complete) break;
    if (now() - t0 >= timeoutMs) {
      fail(st.ack !== st.arm ? `The capture was not armed on the board in ${timeoutMs / 1000} s: is its clock running?`
        : st.triggered ? `The capture triggered but did not complete in ${timeoutMs / 1000} s: is its clock running?`
          : `The trigger has not come in ${timeoutMs / 1000} s: the capture stays armed (run capture with arm: false to wait again).`);
    }
    await sleep(pollMs);
  }
  log(`Triggered${polls > 1 ? ` (${polls} polls)` : ''}; reading ${spec.depth} samples.`);
  const cap = readCapture(spec, await link.scan(readoutCommands(spec)));
  if (cap.errors.length) fail(cap.errors.join(' '));
  return { ...cap, polls };
}

/**
 * A capture as build/capture.json keeps it (the server's and the browser's, the waveform viewer's): { takenAt, top,
 * clock, depth, pre, trigger, polls, probes: [{ path, width, samples: ['0x…'] }] }; probes: planInsertion's (the core's
 * names and the design's paths), cap: runCapture's.
 */
export function captureRecord({ top, clock, spec, probes, cap }) {
  const hex = v => `0x${v.toString(16)}`;
  return { takenAt: new Date().toISOString(), top, clock, depth: +spec.depth, pre: +spec.pre, trigger: cap.trigger, polls: cap.polls,
    probes: probes.map(p => ({ path: p.path, width: p.width, samples: cap.probes[p.name].map(hex) })) };
}

/**
 * The link of a Digilent Adept board over WebUSB (usb: a USBDevice, or the tests' simulated board): the chain scanned,
 * USER1 into the Spartan-3E's instruction register, then each scan()'s words in one sequence of USB commands
 * (core/adept.js JtagSeq). close() releases the board.
 */
export async function adeptLink(usb, spec, { log = () => {} } = {}) {
  const R = planCapture(spec).regBits;
  const a = await new Adept(usb).open();
  try {
    const chain = new Chain(new Djtg(a, 0));
    await chain.init();
    const fpga = chain.devices.find(d => d.kind === 'fpga') ?? fail(`no Spartan-3E FPGA on the JTAG chain (found ${chain.devices.map(d => d.name).join(', ')})`);
    log(`Logic analyzer: ${a.productName || 'Digilent Adept USB'}, ${fpga.name.toUpperCase()}'s USER1 register (${R} bits).`);
    let selected = false;
    return {
      async scan(words) {
        const seq = new JtagSeq(chain);
        if (!selected) { seq.ir(fpga, USER1); selected = true; }
        const reads = words.map(w => seq.dr(fpga, BigInt(w), R, true));
        await seq.run();
        return reads.map(c => c.bytes.reduceRight((v, b) => (v << 8n) | BigInt(b), 0n));
      },
      async close() { try { await chain.close(); } finally { await a.close(); } },
    };
  } catch (e) { await a.close(); throw e; }
}
