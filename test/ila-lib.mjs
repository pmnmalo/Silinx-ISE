// The logic analyzer's tests' shared parts (#3176): a capture's spec and probes, the model of the probes (a counter
// held at 0, then counting), the HDL test bench that plays the PC's part through the core's JTAG register, and the
// core simulated with it (test/ila.test.js, test/ila-link.test.js: the words the bench read, a recorded stream).
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { readWizardSpec } from '../core/clocking.js';
import { captureModule, planCapture, triggerText } from '../core/ila.js';
import { CAPTURE_CMD, readCapture, readStatus, readoutCommands } from '../core/ila-capture.js';

export const PROBES = [{ name: 'count', width: 8 }, { name: 'tick', width: 1 }];
export const WIDE = [...PROBES, { name: 'wide', width: 12 }];
export const capSpec = (o = {}) => ({ wizard: 'capture', version: 1, name: 'ila', lang: 'vhdl', family: 'spartan3e', depth: 16, pre: 4, probes: PROBES,
  trigger: { combine: 'and', conditions: [] }, ...o });
export const cond = (probe, op, value) => ({ probe, op, ...(value === undefined ? {} : { value }) });

// ------------------------------------------------------------------ simulation
// The probes: count (8 bits) held at 0 until `en`, then counting on clk; tick = count(2); wide = count & "1010".
export const probeOf = (spec, c0) => {
  const c = c0 & 255;   // (the 8-bit counter wraps: a window past 256 samples)
  const vals = { count: BigInt(c), tick: BigInt((c >> 2) & 1), wide: BigInt((c << 4) | 0xA) };
  const plan = planCapture(spec);
  return spec.probes.reduce((w, p) => w | (vals[p.name] << BigInt(plan.slices[p.name][0])), 0n);
};
// the model: the count of the trigger's sample (the first that meets the trigger once counting), the window's counts
export function expectedCounts(spec) {
  const cs = spec.trigger.conditions;
  const meets = (c, p) => {
    const val = (x, n) => (n === 'count' ? x : n === 'tick' ? (x >> 2) & 1 : (x << 4) | 0xA);
    const r = cs.map(k => {
      const a = val(c, k.probe), b = val(p, k.probe);
      return k.op === 'rise' ? a && !b : k.op === 'fall' ? !a && b : k.op === 'change' ? a !== b : k.op === '=' ? a === Number(BigInt(k.value)) : a !== Number(BigInt(k.value));
    });
    return spec.trigger.combine === 'or' ? r.some(Boolean) : r.every(Boolean);
  };
  let t = 1;
  while (!meets(t, t - 1)) t++;
  return Array.from({ length: +spec.depth }, (_, k) => Math.max(0, t - +spec.pre + k));
}

export const SCANS = spec => [CAPTURE_CMD.arm, CAPTURE_CMD.status, CAPTURE_CMD.status, ...readoutCommands(spec)];
// the wait for the capture after en: 1 us, or the depth's clocks of 10 ns and some
export const fillNs = spec => Math.max(1000, +spec.depth * 10 + 600);
// the test bench: clk 10 ns; tck 40 ns; the scans [arm, status], then en (counting), a status (the poll: its shifts
// clock the flags across, tck running only during a scan as a BSCAN's DRCK does), then the readout, whose first word
// is the status after the poll; each scan's word reported "S <bits>" (bit 0 first, as tdo gives them)
export function bench(spec, plan, cmds = SCANS(spec)) {
  const R = plan.regBits, W = plan.width, v = spec.lang === 'verilog', fill = fillNs(spec);
  const cat = spec.probes.slice().reverse().map(p => (p.name === 'count' ? 'count' : p.name === 'tick' ? (v ? 'count[2]' : 'count(2)') : v ? "{count, 4'b1010}" : 'std_logic_vector(count) & "1010"'));
  if (!v) {
    return `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity tb is end tb;
architecture sim of tb is
  signal clk, tck, sel, capture, shift, tdi, tdo, en : std_logic := '0';
  signal count : unsigned(7 downto 0) := (others => '0');
  signal probe : std_logic_vector(${W - 1} downto 0);
  type cmds_t is array (0 to ${cmds.length - 1}) of std_logic_vector(1 downto 0);
  constant cmds : cmds_t := (${cmds.map(c => `"${c.toString(2).padStart(2, '0')}"`).join(', ')});
begin
  clk <= not clk after 5 ns;
  process (clk) begin if rising_edge(clk) then if en = '1' then count <= count + 1; end if; end if; end process;
  probe <= ${cat.map(x => (x === 'count' ? 'std_logic_vector(count)' : x)).join(' & ')};
  uut : entity work.${spec.name} port map (clk => clk, probe => probe, tck => tck, sel => sel, capture => capture, shift => shift, tdi => tdi, tdo => tdo);
  process
    variable got : string(1 to ${R});
  begin
    wait for 100 ns;
    for k in 0 to ${cmds.length - 1} loop
      if k = 2 then wait for 400 ns; en <= '1'; wait for ${fill} ns; end if;
      sel <= '1'; capture <= '1'; wait for 20 ns; tck <= '1'; wait for 20 ns; tck <= '0'; capture <= '0'; shift <= '1';
      for i in 0 to ${R - 1} loop
        if i < 2 then tdi <= cmds(k)(i); else tdi <= '0'; end if;
        wait for 20 ns;
        if tdo = '1' then got(i + 1) := '1'; else got(i + 1) := '0'; end if;
        tck <= '1'; wait for 20 ns; tck <= '0';
      end loop;
      shift <= '0'; sel <= '0';
      wait for 20 ns; tck <= '1'; wait for 20 ns; tck <= '0'; wait for 20 ns; tck <= '1'; wait for 20 ns; tck <= '0';
      report "S " & got;
    end loop;
    wait;
  end process;
end sim;`;
  }
  return `\`timescale 1ns / 1ps
module tb;
  reg clk = 0, tck = 0, sel = 0, capture = 0, shift = 0, tdi = 0, en = 0;
  reg [7:0] count = 0;
  wire tdo;
  wire [${W - 1}:0] probe = {${cat.join(', ')}};
  reg [1:0] cmds [0:${cmds.length - 1}];
  reg [${R - 1}:0] got;
  integer k, i;
  always #5 clk = ~clk;
  always @(posedge clk) if (en) count <= count + 1;
  ${spec.name} uut (.clk(clk), .probe(probe), .tck(tck), .sel(sel), .capture(capture), .shift(shift), .tdi(tdi), .tdo(tdo));
  initial begin
${cmds.map((c, k) => `    cmds[${k}] = 2'd${c};`).join('\n')}
    #100;
    for (k = 0; k < ${cmds.length}; k = k + 1) begin
      if (k == 2) begin #400 en = 1; #${fill}; end
      sel = 1; capture = 1; #20 tck = 1; #20 tck = 0; capture = 0; shift = 1;
      for (i = 0; i < ${R}; i = i + 1) begin
        tdi = i < 2 ? cmds[k][i] : 1'b0;
        #20 got[i] = tdo;
        tck = 1; #20 tck = 0;
      end
      shift = 0; sel = 0;
      #20 tck = 1; #20 tck = 0; #20 tck = 1; #20 tck = 0;
      $display("S %b", got);
    end
    $finish;
  end
endmodule`;
}

const lines = r => r.sim.log.filter(l => /^S [01]+$/.test(l.text)).map(l => l.text.slice(2));

/**
 * The core simulated with a bench shifting these commands (the counter counting from before the third scan, as
 * bench's): the word each scan read out (BigInts), and the simulation's warnings of the core and the bench.
 */
export function simulateScans(spec, cmds) {
  const { code, plan } = captureModule(spec);
  const v = spec.lang === 'verilog';
  const sources = [{ path: `src/${spec.name}.${v ? 'v' : 'vhd'}`, text: code }, { path: `sim/tb.${v ? 'v' : 'vhd'}`, text: bench(spec, plan, cmds) }];
  const r = simulate(sources, 'tb', { until: (100 + cmds.length * (plan.regBits + 3) * 40 + 400 + fillNs(spec) + 1000) * 1000 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), [], 'compile errors');
  const warnings = [...(r.lib?.errors || []), ...(r.design?.diags || [])].filter(d => /^(src|sim)\//.test(d.file || '')).map(d => `${d.file}:${d.line}: ${d.message}`);
  // the words: VHDL's string has bit 0 first, Verilog's %b the top bit first
  return { words: lines(r).map(s => BigInt(`0b${v ? s : [...s].reverse().join('')}`)), warnings };
}

/**
 * A link (core/ila-link.js) to the core's HDL simulated: each scan() simulates every scan sent so far again (the
 * simulation is the same each time: the same commands, the same times) and gives the new scans' words; sent: the
 * commands the PC sent (each word's two low bits).
 */
export function hdlLink(spec) {
  const sent = [];
  return {
    sent,
    async scan(words) {
      for (const w of words) sent.push(Number(BigInt(w) & 3n));
      const r = simulateScans(spec, sent);
      assert.deepEqual(r.warnings, [], 'no warnings');
      assert.equal(r.words.length, sent.length);
      return r.words.slice(sent.length - words.length);
    },
  };
}
export function simulateCapture(spec) {
  const { code, plan } = captureModule(spec);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(readWizardSpec(code), spec, 'the settings in the header line');
  const v = spec.lang === 'verilog';
  const sources = [{ path: `src/${spec.name}.${v ? 'v' : 'vhd'}`, text: code }, { path: `sim/tb.${v ? 'v' : 'vhd'}`, text: bench(spec, plan) }];
  // (the bench's time: its scans of R + 3 tck periods of 40 ns, the wait for the counting; then 1 us more)
  const r = simulate(sources, 'tb', { until: (100 + SCANS(spec).length * (plan.regBits + 3) * 40 + 400 + fillNs(spec) + 1000) * 1000 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), [], 'compile errors');
  const warnings = [...(r.lib?.errors || []), ...(r.design?.diags || [])].filter(d => /^(src|sim)\//.test(d.file || '')).map(d => `${d.file}:${d.line}: ${d.message}`);
  assert.deepEqual(warnings, [], 'no warnings');
  // the words: VHDL's string has bit 0 first, Verilog's %b the top bit first
  const words = lines(r).map(s => BigInt(`0b${v ? s : [...s].reverse().join('')}`));
  assert.equal(words.length, SCANS(spec).length);
  const st0 = readStatus(spec, words[0]), st1 = readStatus(spec, words[1]);
  assert.deepEqual([st0.matches, st0.arm, st0.done], [true, 0, false], 'the first status: the core idle');
  assert.deepEqual([st1.arm, st1.ack, st1.complete], [1, 0, false], 'the arm\'s status: the toggle, not acknowledged yet');
  const cap = readCapture(spec, words.slice(3));
  assert.deepEqual(cap.errors, []);
  assert.deepEqual([cap.status.armed, cap.status.triggered, cap.status.done], [false, true, true]);
  const want = expectedCounts(spec);
  assert.deepEqual(cap.samples, want.map(c => probeOf(spec, c)), `${spec.lang} ${triggerText(spec)}: the window ${want[0]}..`);
  return Object.assign(cap, { words });
}

// a model of the core's register (core/ila.js's protocol, for the board's links: test/ila-link.test.js, ila-board.test.js): a scan's command runs at the next scan's capture; the
// arm toggle acknowledged at the next capture; the capture complete `fill` captures after the arm (never: Infinity)
export class CoreModel {
  constructor(spec, samples, { fill = 3, ack = true, shape = null } = {}) {
    const p = planCapture(spec);
    Object.assign(this, { spec, samples, fill, ackOn: ack, bits: p.regBits, width: shape?.width ?? p.width, depth: shape?.depth ?? +spec.depth, cmd: 0,
      armT: 0, ack: 0, armed: 0, triggered: 0, done: 0, since: null, raddr: 0, captures: 0 });
  }
  status() {
    const a = Math.log2(this.depth);
    return BigInt(this.armed | (this.triggered << 1) | (this.done << 2) | (this.armT << 3) | (this.ack << 4) | (a << 5) | ((this.width - 1) << 10));
  }
  capture() {
    this.captures++;
    // (the capture clock's side, between scans: the arm acknowledged, then filled and triggered)
    if (this.since !== null) {
      const n = this.captures - this.since;
      if (this.ackOn && n >= 1) { this.ack = this.armT; this.armed = 1; }
      if (this.ackOn && n >= this.fill) { this.armed = 0; this.triggered = 1; this.done = 1; }
    }
    switch (this.cmd) {
      case CAPTURE_CMD.arm: this.armT ^= 1; this.since = this.captures; this.armed = 0; this.triggered = 0; this.done = 0; return this.status();
      case CAPTURE_CMD.read: return this.samples[this.raddr++] ?? 0n;
      case CAPTURE_CMD.rewind: this.raddr = 0; return this.status();
      default: return this.status();
    }
  }
  update(bits) { this.cmd = bits[0] | (bits[1] << 1); }
}

export const SAMPLES = spec => Array.from({ length: +spec.depth }, (_, k) => probeOf(spec, 100 + k));
// a link (core/ila-link.js) straight to a CoreModel: each word's capture, then the word shifted in
export const modelLink = core => ({ async scan(words) { return words.map(w => { const r = core.capture(); core.update([Number(BigInt(w) & 1n), Number((BigInt(w) >> 1n) & 1n)]); return r; }); } });
