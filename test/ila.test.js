// The logic analyzer's capture core (#3176, core/ila.js) and its host side (core/ila-capture.js): the plans and their
// errors; the core in VHDL and Verilog compiled, elaborated with no warnings and simulated with a test bench that
// plays the PC's part through the JTAG register (arm, the status, the readout), the readout read into a capture and
// compared with a model of the probes (a counter held at 0, then counting: the trigger's sample and the window are
// known); the core free of Check Syntax's design checks and synthesized by the open flow into its block RAM with no
// warnings; a capture replayed as a module whose simulated waves are its samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { readWizardSpec } from '../core/clocking.js';
import { captureModule, planCapture, triggerText, STATUS_BITS } from '../core/ila.js';
import { CAPTURE_CMD, readCapture, readStatus, readoutCommands, replayBench, scanWord } from '../core/ila-capture.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import * as V from '../core/values.js';
import { designChecks } from '../core/lint.js';

const PROBES = [{ name: 'count', width: 8 }, { name: 'tick', width: 1 }];
const WIDE = [...PROBES, { name: 'wide', width: 12 }];
const capSpec = (o = {}) => ({ wizard: 'capture', version: 1, name: 'ila', lang: 'vhdl', family: 'spartan3e', depth: 16, pre: 4, probes: PROBES,
  trigger: { combine: 'and', conditions: [] }, ...o });
const cond = (probe, op, value) => ({ probe, op, ...(value === undefined ? {} : { value }) });

test('a capture\'s plan: the probes\' bits in the sample word, the register, the block RAMs (RAMB16: 1K x 18, 2K x 9, 512 x 36)', () => {
  const p = planCapture(capSpec());
  assert.deepEqual([p.width, p.regBits, p.addrBits, p.slices, p.errors], [9, STATUS_BITS, 4, { count: [0, 7], tick: [8, 8] }, []]);
  assert.equal(p.memory.blocks, 1);
  assert.equal(planCapture(capSpec({ probes: WIDE })).regBits, 21);
  const blocks = (w, d, family = 'spartan3e') => planCapture(capSpec({ family, depth: d, pre: 0, probes: [{ name: 'x', width: w }] })).memory.blocks;
  // the issue's examples on the XC3S100E (4 RAMB16): 16 x 1024, 32 x 512, 8 x 2048 take one block each
  assert.deepEqual([blocks(16, 1024), blocks(32, 512), blocks(8, 2048), blocks(9, 1024), blocks(64, 4096)], [1, 1, 1, 1, 16]);
  // (no probe bit in a parity bit the write port alone has, PhysDesignRules:1060: the word in arrays of the data bits of
  // the widest block holding the depth, a block more when the probes would fill its parity: 17 or 18 bits of 1024 samples,
  // 9 of 2048, 36 of 512; the open flow's routes as many blocks)
  const chunks = (w, d) => planCapture(capSpec({ depth: d, pre: 0, probes: [{ name: 'x', width: w }] })).chunks;
  assert.deepEqual([blocks(17, 1024), blocks(18, 1024), blocks(24, 1024), blocks(9, 2048), blocks(36, 512), blocks(36, 1024)], [2, 2, 2, 2, 2, 3]);
  assert.deepEqual([chunks(16, 1024), chunks(24, 1024), chunks(9, 2048), chunks(36, 512)], [[[0, 15]], [[0, 15], [16, 23]], [[0, 7], [8, 8]], [[0, 31], [32, 35]]]);
  assert.deepEqual(planCapture(capSpec({ family: 'spartan6', depth: 1024, pre: 0, probes: [{ name: 'x', width: 24 }] })).chunks, [[0, 23]]);
  assert.equal(planCapture(capSpec({ family: 'artix7' })).memory, null);
  assert.deepEqual(triggerText(capSpec()), 'the first sample');
  assert.equal(triggerText(capSpec({ trigger: { combine: 'or', conditions: [cond('count', '=', 20), cond('tick', 'rise'), cond('count', 'change')] } })), 'count = 20 or tick rises or count changes');
});

test('a capture\'s errors: the probes, the depth, the samples before the trigger, the trigger\'s conditions, the name', () => {
  const errs = o => planCapture(capSpec(o)).errors;
  assert.deepEqual(errs({ probes: [] }), ['A capture watches one probe or more.']);
  assert.deepEqual(errs({ probes: [{ name: '2x', width: 1 }] }), ["Probe '2x' must start with a letter."]);
  assert.deepEqual(errs({ probes: [{ name: 'a', width: 1 }, { name: 'A', width: 2 }] }), ["Probe 'A' is given twice."]);
  assert.deepEqual(errs({ probes: [{ name: 'a', width: 0 }] }), ["Probe 'a': the width is a whole number of bits from 1."]);
  assert.deepEqual(errs({ probes: [{ name: 'a', width: 200 }, { name: 'b', width: 57 }] }), ['The probes take 257 bits: at most 256.']);
  assert.deepEqual(errs({ depth: 100 }), ['The depth is a power of 2 from 16 to 16384 samples.']);
  assert.deepEqual(errs({ depth: 8 }), ['The depth is a power of 2 from 16 to 16384 samples.']);
  assert.deepEqual(errs({ depth: 32768 }), ['The depth is a power of 2 from 16 to 16384 samples.']);
  assert.deepEqual(errs({ pre: 16 }), ['The samples before the trigger are a whole number from 0 to 15.']);
  assert.deepEqual(errs({ pre: -1 }), ['The samples before the trigger are a whole number from 0 to 15.']);
  const t = (conditions, combine = 'and') => errs({ trigger: { combine, conditions } });
  assert.deepEqual(t([], 'xor'), ["The trigger's conditions combine as 'and' or 'or'."]);
  assert.deepEqual(t([cond('nope', '=', 1)]), ["The trigger's probe 'nope' is not one of the capture's."]);
  assert.deepEqual(t([cond('count', '<', 1)]), ["The trigger's operator '<' is not one of =, !=, rise, fall, change."]);
  assert.deepEqual(t([cond('count', 'rise')]), ["The trigger's rising edge is of a probe of one bit ('count' has 8)."]);
  assert.deepEqual(t([cond('count', 'fall')]), ["The trigger's falling edge is of a probe of one bit ('count' has 8)."]);
  assert.deepEqual(t([cond('count', '=', 256)]), ["The trigger's value of 'count' is a whole number from 0 to 255."]);
  assert.deepEqual(t([cond('tick', '!=', 'x')]), ["The trigger's value of 'tick' is a whole number from 0 to 1."]);
  assert.deepEqual(t([cond('count', '=', '0x1F'), cond('tick', '!=', 1), cond('count', 'change')]), []);
  assert.deepEqual(errs({ name: 'probe' }), ["The module's name 'probe' is one of its ports'."]);
  assert.deepEqual(errs({ name: 'end' }), ["The module's name: 'end' is a reserved word of VHDL and Verilog."]);
  assert.equal(captureModule(capSpec({ depth: 3 })).code, '');
});

test('the status word and the readout read back: the flags, the shape, a capture not armed, not triggered, not done', () => {
  const spec = capSpec();
  const status = (flags, arm, ack, w = 9, a = 4) => BigInt(flags | (arm << 3) | (ack << 4) | (a << 5) | ((w - 1) << 10));
  assert.deepEqual(readStatus(spec, status(0b101, 1, 1)), { armed: true, triggered: false, done: true, arm: 1, ack: 1, depth: 16, width: 9, complete: true, matches: true });
  assert.equal(readStatus(spec, status(0b100, 1, 0)).complete, false);
  assert.equal(readStatus(spec, status(0b100, 0, 0, 10)).matches, false);
  assert.deepEqual(readoutCommands(spec), [3, ...Array(16).fill(2), 0]);
  assert.deepEqual([scanWord(spec, CAPTURE_CMD.arm), scanWord(spec, CAPTURE_CMD.rewind)], [1n, 3n]);
  assert.throws(() => scanWord(spec, 4), /no capture command 4/);
  const words = st => [st, st, ...Array.from({ length: 16 }, (_, k) => BigInt(k | ((k & 1) << 8) | (1 << 12)))];
  const c = readCapture(spec, words(status(0b110, 1, 1)));
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.probes.count, Array.from({ length: 16 }, (_, k) => BigInt(k)));
  assert.deepEqual(c.probes.tick.slice(0, 4), [0n, 1n, 0n, 1n]);
  assert.equal(c.trigger, 4);
  assert.deepEqual(readCapture(spec, words(status(0, 1, 0))).errors, ['The capture is not armed yet.']);
  assert.deepEqual(readCapture(spec, words(status(0b001, 0, 0))).errors, ['The capture is not done: its trigger has not come.']);
  assert.deepEqual(readCapture(spec, words(status(0b011, 0, 0))).errors, ['The capture is not done: it has triggered, the samples after the trigger are coming.']);
  assert.deepEqual(readCapture(spec, words(status(0b100, 0, 0, 12, 5))).errors, ["The board's core is not this capture's: 12 bit(s) x 32 samples, not 9 x 16."]);
  assert.deepEqual(readCapture(spec, [0n]).errors, ['A readout is 18 words: 1 read.']);
});

// ------------------------------------------------------------------ simulation
// The probes: count (8 bits) held at 0 until `en`, then counting on clk; tick = count(2); wide = count & "1010".
const probeOf = (spec, c0) => {
  const c = c0 & 255;   // (the 8-bit counter wraps: a window past 256 samples)
  const vals = { count: BigInt(c), tick: BigInt((c >> 2) & 1), wide: BigInt((c << 4) | 0xA) };
  const plan = planCapture(spec);
  return spec.probes.reduce((w, p) => w | (vals[p.name] << BigInt(plan.slices[p.name][0])), 0n);
};
// the model: the count of the trigger's sample (the first that meets the trigger once counting), the window's counts
function expectedCounts(spec) {
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

const SCANS = spec => [CAPTURE_CMD.arm, CAPTURE_CMD.status, CAPTURE_CMD.status, ...readoutCommands(spec)];
// the wait for the capture after en: 1 us, or the depth's clocks of 10 ns and some
const fillNs = spec => Math.max(1000, +spec.depth * 10 + 600);
// the test bench: clk 10 ns; tck 40 ns; the scans [arm, status], then en (counting), a status (the poll: its shifts
// clock the flags across, tck running only during a scan as a BSCAN's DRCK does), then the readout, whose first word
// is the status after the poll; each scan's word reported "S <bits>" (bit 0 first, as tdo gives them)
function bench(spec, plan) {
  const R = plan.regBits, W = plan.width, cmds = SCANS(spec), v = spec.lang === 'verilog', fill = fillNs(spec);
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
function simulateCapture(spec) {
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
  return cap;
}

const CASES = [
  { pre: 4, trigger: { combine: 'and', conditions: [cond('count', '=', 20)] } },
  { depth: 32, pre: 8, trigger: { combine: 'and', conditions: [cond('tick', 'rise')] } },
  { pre: 2, trigger: { combine: 'or', conditions: [cond('count', '=', 50), cond('tick', 'fall')] } },
  { pre: 0, trigger: { combine: 'and', conditions: [cond('count', '!=', 0)] } },
  { pre: 6, probes: WIDE, trigger: { combine: 'and', conditions: [cond('count', 'change'), cond('tick', '=', 1)] } },
  { pre: 15, trigger: { combine: 'and', conditions: [cond('count', '=', 40)] } },
  { pre: 1, probes: [PROBES[1], { name: 'wide', width: 12 }], trigger: { combine: 'and', conditions: [cond('wide', '=', (30 << 4) | 0xA)] } },
];
for (const lang of ['vhdl', 'verilog']) {
  test(`the capture core simulated (${lang}): armed, triggered, read through the JTAG register into the model's window`, () => {
    for (const c of CASES) simulateCapture(capSpec({ lang, ...c }));
  });
}
// (1024 samples of 21 bits on the Spartan-3E: the memory in two arrays, 16 and 5 bits, planCapture's chunks)
for (const lang of ['vhdl', 'verilog']) {
  test(`the capture core in two arrays simulated (${lang}): the readout the model's window`, () => {
    const spec = capSpec({ lang, depth: 1024, pre: 10, probes: WIDE, trigger: { combine: 'and', conditions: [cond('count', '=', 30)] } });
    assert.deepEqual(planCapture(spec).chunks, [[0, 15], [16, 20]]);
    assert.match(captureModule(spec).code, lang === 'verilog' ? /reg \[4:0\] mem1 \[0:1023\];/ : /type mem1_t is array \(0 to 1023\) of std_logic_vector\(4 downto 0\);/);
    simulateCapture(spec);
  });
}

test('the core checked (Check Syntax\'s design checks) and synthesized by the open flow (Spartan-3E, Spartan-6; VHDL, Verilog): its sample memory one block RAM, no warnings', async () => {
  for (const [family, ram] of [['spartan3e', /^RAMB16_S9_S9$/], ['spartan6', /^RAMB(8|16)BWER$/]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const spec = capSpec({ family, lang, depth: 1024, pre: 100, trigger: { combine: 'and', conditions: [cond('tick', 'rise'), cond('count', '!=', 3)] } });
      const { code } = captureModule(spec);
      const lib = compile([{ path: `src/ila.${lang === 'verilog' ? 'v' : 'vhd'}`, text: code }]);
      const design = elaborate(lib, 'ila');
      assert.deepEqual(design.diags.map(d => d.message), [], `${family} ${lang}: elaboration`);
      assert.deepEqual(designChecks(lib, design).map(d => `${d.check}@${d.line}: ${d.message}`), [], `${family} ${lang}: Check Syntax's design checks`);
      const r = await synthesizeOpen(design, { family, run: yosysNode });
      const rams = Object.entries(r.cells).filter(([k]) => /^RAMB/.test(k));
      assert.equal(rams.length, 1, `${family} ${lang}: ${JSON.stringify(rams)}`);
      assert.match(rams[0][0], ram, `${family} ${lang}`);
      assert.equal(rams[0][1], 1, `${family} ${lang}`);
      assert.deepEqual(r.warnings, [], `${family} ${lang}: warnings`);
    }
  }
});

test('a capture replayed (VHDL, Verilog): its module\'s simulated waves are the samples, one per period, the probes\' names and buses', () => {
  const spec = capSpec({ probes: WIDE, pre: 6, trigger: { combine: 'and', conditions: [cond('count', 'change'), cond('tick', '=', 1)] } });
  const cap = simulateCapture(spec);
  for (const lang of ['vhdl', 'verilog']) {
    const text = replayBench(spec, cap, { lang, period: 10000 });
    const lib = compile([{ path: `sim/ila_replay.${lang === 'verilog' ? 'v' : 'vhd'}`, text }]);
    assert.deepEqual(lib.errors.map(e => e.message), [], lang);
    const design = elaborate(lib, 'ila_replay');
    assert.deepEqual(design.diags.map(d => d.message), [], `${lang}: no warnings`);
    const sim = new Simulator(design);
    sim.run(16 * 10000 + 1);
    for (const p of spec.probes) {
      const sig = design.signals.find(s => s.name === p.name);
      assert.ok(sig, `${lang}: ${p.name}`);
      assert.equal(sig.t.w, p.width, `${lang}: ${p.name}'s width`);
      for (let k = 0; k < 16; k++) {
        const x = sim.valueAt(sig, k * 10000 + 5000);
        assert.equal(BigInt(`0b${V.toBin(x)}`), cap.probes[p.name][k], `${lang}: ${p.name} at sample ${k}`);
      }
    }
  }
});

