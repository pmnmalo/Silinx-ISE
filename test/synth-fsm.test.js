// FSM extraction and re-encoding (#438, research/synth-quality/fsm.mjs): the measurement's parsers of Yosys's
// messages and files (fsm_detect's log, fsm_recode's -encfile, RTLIL's init attributes), XST's report, the new
// power-up state of a re-encoded machine, and a machine extracted with Yosys from the open synthesis's own script,
// equal to the RTL from power-up in each encoding, with its exact warnings; and the tables. The open synthesis at
// Optimization Effort High (#539, core/synth-fsm.js): the machines of 8 states or more tried one-hot, equal to the
// RTL from power-up and with the resets, in VHDL and in Verilog; 7 states, Normal and an integer'left start left
// as they are; a failed run said and the usual netlist kept. The machines fsm_detect refuses for their users alone
// (#652), marked by hand at both efforts: in VHDL and in Verilog, with and without a power-up value, equal to the RTL,
// no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { parseDetect, chosen, markWires, parseEncfile, newInit, setInits, fsmRun, detectTable, resultsTable, WAYS } from '../research/synth-quality/fsm.mjs';
import { parseSyrFsms } from '../research/synth-quality/fsm-ise.mjs';
import { compareNetlist } from './diff-synth.js';
import { wireInits, fsmChosen, fsmInits, fsmProbeCommands, fsmExtractCommands, fsmForceCommands, fsmRestCommands, refusedForUsers, quietForced, oldStateInits, FSM_RULE, PREP_HEAD, PREP_TAIL, USERS_REASON } from '../core/synth-fsm.js';

test('FSM measurement: fsm_detect\'s messages, the registers each way extracts', () => {
  const lines = [
    '13. Executing FSM_DETECT pass (finding FSMs in design).',
    'Not marking top.u_timer.timed as FSM state register:',
    "    Users of register don't seem to benefit from recoding.",
    'Found FSM state register top.u_fsm.state_reg.',
    'Not marking top.st_id as FSM state register:',
    '    Register is connected to module port.',
    "    Users of register don't seem to benefit from recoding.",
    'Not marking top.cnt as FSM state register:',
    '    Register has an initialization value.',
    'Not marking top.odd as FSM state register:',
    '    Register is connected to module port.',
    '    Circuit seems to be self-resetting.',
    'Found FSM state register top.top.inner.',
  ];
  const det = parseDetect(lines, 'top');
  assert.deepEqual(det.marked, ['u_fsm.state_reg', 'top.inner']);   // (only the module's own prefix is taken off)
  assert.deepEqual(det.refused.map(r => r.wire), ['u_timer.timed', 'st_id', 'cnt', 'odd']);
  assert.deepEqual(det.refused[1].reasons, ['Register is connected to module port.', "Users of register don't seem to benefit from recoding."]);
  assert.deepEqual(chosen('stock', det), []);
  assert.deepEqual(chosen('base', det), []);
  assert.deepEqual(chosen('onehot', det), ['u_fsm.state_reg', 'top.inner']);
  assert.deepEqual(chosen('binary', det), ['u_fsm.state_reg', 'top.inner']);
  // a port's register too, but not one refused for another reason as well (odd: self-resetting)
  assert.deepEqual(chosen('onehot-port', det), ['u_fsm.state_reg', 'top.inner', 'st_id']);
  assert.deepEqual(parseDetect([], 'top'), { marked: [], refused: [] });
  assert.deepEqual(WAYS, ['stock', 'base', 'binary', 'onehot', 'onehot-port', 'core']);
  assert.deepEqual(chosen('core', det), []);
});

test('FSM measurement: the init values taken off and given back in the RTLIL, the new code of the init state', () => {
  const il = [
    'module \\top',
    '  attribute \\src "top_syn.v:12"',
    '  attribute \\init 3\'010',
    '  wire width 3 \\u_fsm.state_reg',
    '  attribute \\init 1\'1',
    '  wire \\keep',
    '  attribute \\init 2\'01',
    '  wire width 2 $auto$x',
    'end',
  ].join('\n');
  const { il: marked, inits } = markWires(il, ['u_fsm.state_reg', '$auto$x']);
  assert.deepEqual(inits, { '\\u_fsm.state_reg': "3'010", '$auto$x': "2'01" });
  assert.equal(marked, [
    'module \\top',
    '  attribute \\src "top_syn.v:12"',
    '  attribute \\fsm_encoding "auto"',
    '  wire width 3 \\u_fsm.state_reg',
    '  attribute \\init 1\'1',
    '  wire \\keep',
    '  attribute \\fsm_encoding "auto"',
    '  wire width 2 $auto$x',
    'end',
  ].join('\n'));
  // fsm_recode's -encfile (one-hot with don't-cares), the init state's new code with the don't-cares 0
  const enc = parseEncfile('.fsm top u_fsm.state_reg\n.map 000 ------1\n.map 010 ----1--\n.map 110 ---1---\n.fsm top other\n.map 01 10\n');
  assert.deepEqual(Object.keys(enc), ['u_fsm.state_reg', 'other']);
  assert.deepEqual(enc['u_fsm.state_reg'][1], ['010', '----1--']);
  assert.equal(newInit("3'010", enc['u_fsm.state_reg']), "7'0000100");
  assert.equal(newInit("3'000", enc['u_fsm.state_reg']), "7'0000001");
  assert.equal(newInit("3'10", enc['u_fsm.state_reg']), "7'0000100");      // (Yosys leaves the leading zeros out)
  assert.equal(newInit("3'111", enc['u_fsm.state_reg']), null);            // not one of the states (fsm_opt dropped it)
  assert.equal(newInit("3'0x0", enc['u_fsm.state_reg']), null);            // unknown bits
  assert.equal(newInit(undefined, enc['u_fsm.state_reg']), null);
  assert.deepEqual(parseEncfile(''), {});
  // the re-encoded register (7 bits now) gets its new init; a width that does not match is an error
  const post = 'module \\top\n  wire width 7 \\u_fsm.state_reg\n  wire \\keep\nend';
  assert.equal(setInits(post, { '\\u_fsm.state_reg': "7'0000100" }), "module \\top\n  attribute \\init 7'0000100\n  wire width 7 \\u_fsm.state_reg\n  wire \\keep\nend");
  assert.equal(setInits(post, { '\\keep': "1'1" }), "module \\top\n  wire width 7 \\u_fsm.state_reg\n  attribute \\init 1'1\n  wire \\keep\nend");
  assert.throws(() => setInits(post, { '\\u_fsm.state_reg': "3'010" }), /u_fsm\.state_reg has 7 bits, its new init 3'010/);
});

test('FSM measurement: XST\'s state machines and the encodings it chose, from its report', () => {
  const syr = [
    'Synthesizing Unit <traffic>.',
    '    Found finite state machine <FSM_0> for signal <state_reg>.',
    '    -----------------------------------------------------------------------',
    '    | States             | 7                                              |',
    '    | Transitions        | 15                                             |',
    '    | Encoding           | automatic                                      |',
    '    -----------------------------------------------------------------------',
    '    Found finite state machine <FSM_1> for signal <rx_state>.',
    '    | States             | 4                                              |',
    'Analyzing FSM <FSM_0> for best encoding.',
    'Optimizing FSM <u_fsm/state_reg/FSM> on signal <state_reg[1:7]> with one-hot encoding.',
    'Optimizing FSM <u_rx/rx_state/FSM> on signal <rx_state[1:2]> with gray encoding.',
  ].join('\n');
  const r = parseSyrFsms(syr);
  assert.deepEqual(r.found, [{ fsm: 'FSM_0', signal: 'state_reg', states: 7 }, { fsm: 'FSM_1', signal: 'rx_state', states: 4 }]);
  assert.deepEqual(r.chose, [
    { fsm: 'u_fsm/state_reg/FSM', signal: 'state_reg[1:7]', encoding: 'one-hot' },
    { fsm: 'u_rx/rx_state/FSM', signal: 'rx_state[1:2]', encoding: 'gray' },
  ]);
  assert.deepEqual(parseSyrFsms('Synthesizing Unit <top>.\n'), { found: [], chose: [] });
});

// a machine of 4 states with no reset: only its declared initial value (S1, not the first: code 01) starts it
const FSM_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, go, back : in std_logic; y, z : out std_logic); end entity;
architecture rtl of top is
  type st_t is (S0, S1, S2, S3);
  signal st : st_t := S1;
begin
  process (clk) begin
    if rising_edge(clk) then
      case st is
        when S0 => if go = '1' then st <= S1; end if;
        when S1 => if go = '1' then st <= S2; elsif back = '1' then st <= S0; end if;
        when S2 => if back = '1' then st <= S1; else st <= S3; end if;
        when S3 => if go = '0' then st <= S0; end if;
      end case;
    end if;
  end process;
  y <= '1' when st = S1 or st = S3 else '0';
  z <= '1' when st = S2 else '0';
end architecture;
`;

test('FSM measurement with Yosys: a machine with an initial value extracted, re-encoded, equal to the RTL from power-up', { timeout: 300000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { synthesizeOpen, utilization } = await import('../core/synth-open.js');
  const design = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: FSM_VHDL }]), 'top');
  const sim = { cycles: 200, clock: 'clk' };
  const got = {};
  for (const way of ['stock', 'base', 'binary', 'onehot']) {
    const rec = [];
    const syn = await synthesizeOpen(design, { run: fsmRun(yosysNode, way, rec), effort: 'normal' });
    got[way] = { ffs: utilization(syn.cells).flipFlops, rec: rec[0] };
    assert.deepEqual(syn.warnings, [], `${way}: no warnings`);
    for (const s of [sim, { ...sim, resetCycles: 0 }]) {
      const r = compareNetlist(design, syn, { name: way, seed: way, sim: s });
      assert.equal(r.status, 'pass', `${way}: ${r.report || r.reason}`);
    }
  }
  // today: the state register is refused for its initial value; without it, fsm_detect marks it
  assert.equal(got.stock.rec, undefined);
  assert.deepEqual(got.base.rec.now, { marked: [], refusedInit: ['st'] });
  assert.deepEqual(got.base.rec.detect, { marked: ['st'], refused: [] });
  assert.deepEqual(got.base.rec.fsms, []);
  assert.equal(got.stock.ffs, 2);
  assert.equal(got.base.ffs, 2);
  // binary: extracted, its codes kept (already packed binary), its init too
  assert.deepEqual(got.binary.rec.fsms, [{ wire: 'st', states: 4, bitsBefore: null, bitsAfter: null, recoded: false, init: "2'01", newInit: "2'01", reset: null }]);
  assert.equal(got.binary.ffs, 2);
  // one-hot: 4 flip-flops, S1's set at power-up (its bit: the order in which fsm_extract found the state codes)
  assert.deepEqual(got.onehot.rec.fsms, [{ wire: 'st', states: 4, bitsBefore: 2, bitsAfter: 4, recoded: true, init: "2'01", newInit: "4'0100", reset: null }]);
  assert.deepEqual(got.onehot.rec.notExtracted, []);
  assert.equal(got.onehot.ffs, 4);
});

test('FSM measurement: the tables, the geometric means against base', () => {
  const det = {
    a: { now: { marked: [], refusedInit: ['st'] }, detect: { marked: ['st'], refused: [{ wire: 'cnt', reasons: ["Users of register don't seem to benefit from recoding."] }] } },
    b: { now: { marked: ['s'], refusedInit: [] }, detect: { marked: ['s'], refused: [{ wire: 'id', reasons: ['Register is connected to module port.'] }] } },
    c: { now: { marked: [], refusedInit: [] }, detect: { marked: [], refused: [] } },
    d: { error: 'front end: x' },
  };
  const t = detectTable(det);
  assert.match(t, /^\| a \| 0 \| 1 \| 1 \(`st`\) \| 0 \| 1 \| 0 \|$/m);
  assert.match(t, /^\| b \| 1 \| 0 \| 1 \(`s`\) \| 1 \| 0 \| 0 \|$/m);
  assert.doesNotMatch(t, /^\| c \|/m);
  assert.match(t, /^\| d \| \(front end: x\) \|/m);
  assert.match(t, /^\| \*\*all 4 designs\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*2\*\* \(in 2 designs\) \| 1 \| 1 \| 0 \|$/m);
  const res = {
    a: {
      base: { luts: 100, ffs: 10, slices: 50, period: 10, diff: 'pass', diffPowerUp: 'pass' },
      onehot: { luts: 81, ffs: 14, slices: 40, period: 8, fsms: [{ states: 4, bitsBefore: 2, bitsAfter: 4, recoded: true }], diff: 'pass', diffPowerUp: 'pass' },
      'onehot-port': { same: 'onehot' },
    },
    b: {
      base: { luts: 200, ffs: 20, slices: 100, period: 20 },
      onehot: { luts: 200, ffs: 20, slices: 125, period: 20, fsms: [{ states: 3, recoded: false }] },
      'onehot-port': { error: 'route: 1 nets unrouted' },
    },
  };
  const r = resultsTable(res, ['base', 'onehot', 'onehot-port'], { a: { luts: 90, ffs: 12, slices: 45, periodNs: 7.5 } });
  assert.match(r, /^\| a \| onehot \| 4: 2→4 \| 81 \| 14 \| 40 \| 8\.00 \| −20\.0 % \| −20\.0 % \| pass \/ pass \|$/m);
  assert.match(r, /^\| a \| onehot-port \| as onehot \|/m);
  assert.match(r, /^\| a \| XST \|  \| 90 \| 12 \| 45 \| 7\.50 \|/m);
  assert.match(r, /^\| b \| onehot \| 3: kept \| 200 \| 20 \| 125 \| 20\.00 \| \+25\.0 % \| \+0\.0 % \| – \/ – \|$/m);
  assert.match(r, /^\| b \| onehot-port \| \(route: 1 nets unrouted\) \|/m);
  // a alone is measured every way (onehot-port as onehot); b's onehot-port failed
  assert.match(r, /\(1 designs measured every way\)/);
  assert.match(r, /^- onehot: 0\.810 \/ 1\.400 \/ 0\.800 \/ 0\.800$/m);
});

test('One-hot state machines (#539): the machines chosen from the first run, their new init values from the second', () => {
  const pre = [
    'module \\top',
    '  attribute \\src "top_syn.v:3"',
    '  attribute \\init 3\'111',
    '  wire width 3 \\st',
    '  attribute \\init 3\'000',
    '  wire width 3 \\small',
    '  wire width 4 \\noinit',
    '  attribute \\init 32\'10000000000000000000000000000000',
    '  wire width 32 \\int',
    'end',
  ].join('\n');
  assert.deepEqual(wireInits(pre), { '\\st': "3'111", '\\small': "3'000", '\\int': "32'10000000000000000000000000000000" });
  const codes = n => Array.from({ length: n }, (_, i) => [i.toString(2).padStart(3, '0'), '-'.repeat(n - 1 - i) + '1' + '-'.repeat(i)]);
  const enc = [
    '.fsm top st', ...codes(8).map(([o, c]) => `.map ${o} ${c}`),
    '.fsm top small', ...codes(7).map(([o, c]) => `.map ${o} ${c}`),
    '.fsm top noinit', ...codes(8).map(([o, c]) => `.map 0${o} ${c}`),
    // (an integer starting at integer'left, never written again: its init not one of its states)
    '.fsm top int', ...codes(9).map(([o, c]) => `.map ${o.padStart(32, '0')} ${c}`),
  ].join('\n');
  // st alone: small has 7 states, noinit no init (Yosys extracts it already), int cannot keep its power-up state
  assert.deepEqual(fsmChosen(pre, enc), [{ wire: 'st', states: 8, init: "3'111" }]);
  assert.deepEqual(fsmChosen(pre, enc, { states: 7 }).map(m => m.wire), ['st', 'small']);
  assert.equal(FSM_RULE.states, 8);
  assert.deepEqual(fsmChosen(pre, ''), []);
  // the second run's codes: st's init state (111, the 8th found) gets bit 7
  const machines = [{ wire: 'st', states: 8, init: "3'111" }];
  assert.deepEqual(fsmInits(machines, enc), { '\\st': "8'10000000" });
  assert.equal(fsmInits(machines, ''), null);                                            // not re-encoded
  assert.equal(fsmInits(machines, ['.fsm top st', ...codes(7).map(([o, c]) => `.map ${o} ${c}`)].join('\n')), null);   // other states
  assert.deepEqual(fsmInits([], ''), {});
  // the three runs' scripts
  const synth = 'synth_xilinx -family xc3se -ise -flatten -top top';
  assert.equal(fsmProbeCommands('read_verilog -sv top_syn.v; ', synth), `read_verilog -sv top_syn.v; ${synth} -run :prepare; ${PREP_HEAD}; write_rtlil silinx_fsm_pre.il; `
    + 'tee -q setattr -unset init; tee -q -o silinx_fsm_detect.txt fsm_detect; tee -q fsm -nodetect -encoding one-hot -encfile silinx_fsm_enc.txt');
  assert.equal(fsmExtractCommands(), 'read_rtlil silinx_fsm_marked.il; fsm -encfile silinx_fsm_enc.txt; write_rtlil silinx_fsm_post.il');
  assert.equal(fsmRestCommands(synth, 'abc'), `read_rtlil silinx_fsm_post.il; ${PREP_TAIL}; ${synth} -run map_dsp:fine; abc`);
});

test('One-hot state machines (#652): the registers refused for their users alone, marked by hand, their power-up state', () => {
  const detect = [
    'Not marking top.u.c_state as FSM state register:',
    `    ${USERS_REASON}`,
    'Found FSM state register top.st.',
    'Not marking top.port_reg as FSM state register:',
    '    Register is connected to module port.',
    `    ${USERS_REASON}`,
    'Not marking top.cnt as FSM state register:',
    '    Circuit seems to be self-resetting.',
  ].join('\n');
  // a register a port reads is never forced (Yosys 0.70 crashes on one, ITC'99 b06), nor one refused for another reason
  assert.deepEqual(refusedForUsers(detect, 'top'), ['u.c_state']);
  assert.deepEqual(refusedForUsers('', 'top'), []);
  assert.deepEqual(refusedForUsers(undefined, 'top'), []);
  assert.equal(USERS_REASON, "Users of register don't seem to benefit from recoding.");
  // u.c_state forced: no init value, so state 0 (the flip-flops' power-up) as its init; 8 states kept by the rule
  const pre = "module \\top\n  wire width 3 \\u.c_state\n  attribute \\init 3'101\n  wire width 3 \\v\n  wire width 3 \\w\nend";
  const codes = (n, from = 0) => Array.from({ length: n }, (_, i) => [(i + from).toString(2).padStart(3, '0'), '-'.repeat(n - 1 - i) + '1' + '-'.repeat(i)]);
  const enc = (name, n, from) => [`.fsm top ${name}`, ...codes(n, from).map(([o, c]) => `.map ${o} ${c}`)];
  const text = [...enc('u.c_state', 8), ...enc('v', 8), ...enc('w', 7, 1)].join('\n');
  assert.deepEqual(fsmChosen(pre, text, FSM_RULE, ['u.c_state']), [{ wire: 'u.c_state', states: 8, init: "3'000" }, { wire: 'v', states: 8, init: "3'101" }]);
  // not forced: no init, so Yosys's own (it extracts it already)
  assert.deepEqual(fsmChosen(pre, text), [{ wire: 'v', states: 8, init: "3'101" }]);
  // forced, but state 0 not one of its states (w: 1 … 7), or fewer states than the rule's: not kept
  assert.deepEqual(fsmChosen(pre, text, FSM_RULE, ['w']).map(m => m.wire), ['v']);
  assert.deepEqual(fsmChosen(pre, text, { states: 7 }, ['w']).map(m => m.wire), ['v']);
  assert.deepEqual(fsmChosen(pre, enc('w', 7, 0).join('\n'), { states: 7 }, ['w']), [{ wire: 'w', states: 7, init: "3'000" }]);
  assert.deepEqual(fsmInits([{ wire: 'u.c_state', states: 8, init: "3'000" }], text), { '\\u.c_state': "8'00000001" });
  // the copy of an old state register fsm keeps for a reader it cannot take in: its machine's old init
  const post = "module \\top\n  wire width 3 $fsm$oldstate\\u.c_state\n  wire width 8 \\u.c_state\nend";
  assert.deepEqual(oldStateInits([{ wire: 'u.c_state', states: 8, init: "3'000" }, { wire: 'v', states: 8, init: "3'101" }], post), { '$fsm$oldstate\\u.c_state': "3'000" });
  assert.deepEqual(oldStateInits([{ wire: 'v', states: 8, init: "3'101" }], post), {});
  assert.equal(fsmForceCommands(), 'read_rtlil silinx_fsm_forced.il; tee -q setattr -unset init; tee -q fsm_detect; tee -q fsm -nodetect -encoding one-hot -encfile silinx_fsm_enc.txt');
  // Yosys's warning on a wire marked by hand, and its reasons, not said; every other line is
  const said = [];
  const say = quietForced(l => said.push(l), 'top', ['u.c_state']);
  for (const l of ['Warning: Regarding the user-specified fsm_encoding attribute on top.u.c_state:', '    Users of state reg look like FSM recoding might result in larger circuit.',
    'Warning: x', 'Warning: Regarding the user-specified fsm_encoding attribute on top.other:', '    Users of state reg look like FSM recoding might result in larger circuit.', 'done']) say(l);
  assert.deepEqual(said, ['Warning: x', 'Warning: Regarding the user-specified fsm_encoding attribute on top.other:', '    Users of state reg look like FSM recoding might result in larger circuit.', 'done']);
});

// a machine of `n` states with no reset (its declared initial value, not the first state, starts it) and with a
// synchronous one (rst: to S0), in VHDL and in Verilog
const machineVhdl = n => `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, rst, go, back : in std_logic; y : out std_logic_vector(2 downto 0); z : out std_logic); end entity;
architecture rtl of top is
  type st_t is (${Array.from({ length: n }, (_, i) => `S${i}`).join(', ')});
  signal st : st_t := S2;
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then st <= S0;
      else
        case st is
${Array.from({ length: n }, (_, i) => `          when S${i} => if go = '1' then st <= S${(i + 1) % n}; elsif back = '1' then st <= S${(i + n - 2) % n}; end if;`).join('\n')}
        end case;
      end if;
    end if;
  end process;
  y <= "001" when st = S1 or st = S${n - 2} else "010" when st = S3 else "100" when st = S2 or st = S${n - 1} else "000";
  z <= '1' when st = S${n - 3} or st = S0 else '0';
end architecture;
`;
const machineVerilog = n => `module top (input clk, input rst, input go, input back, output reg [2:0] y, output z);
  reg [3:0] st = 4'd2;
  always @(posedge clk)
    if (rst) st <= 4'd0;
    else case (st)
${Array.from({ length: n }, (_, i) => `      4'd${i}: if (go) st <= 4'd${(i + 1) % n}; else if (back) st <= 4'd${(i + n - 2) % n};`).join('\n')}
      default: st <= 4'd0;
    endcase
  always @* case (st)
    4'd1, 4'd${n - 2}: y = 3'b001;
    4'd3: y = 3'b010;
    4'd2, 4'd${n - 1}: y = 3'b100;
    default: y = 3'b000;
  endcase
  assign z = st == 4'd${n - 3} || st == 4'd0;
endmodule
`;
const SIM = { cycles: 300, clock: 'clk' };
const simulated = (design, syn, name) => {
  for (const s of [SIM, { ...SIM, resetCycles: 0 }]) {
    const r = compareNetlist(design, syn, { name, seed: name, sim: s });
    assert.equal(r.status, 'pass', `${name} (reset cycles ${s.resetCycles ?? 'default'}): ${r.report || r.reason}`);
  }
};

test('One-hot state machines (#539) with Yosys: 8 states one-hot at High, equal to the RTL from power-up, VHDL and Verilog; 7 and Normal left', { timeout: 600000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { synthesizeOpen, utilization } = await import('../core/synth-open.js');
  for (const [lang, src] of [['vhdl', machineVhdl], ['verilog', machineVerilog]]) {
    const design = elaborate(compile([{ path: lang === 'vhdl' ? 'top.vhd' : 'top.v', lang, text: src(8) }]), 'top');
    const binary = 3;   // (the state register's bits: VHDL's 8 states; Verilog's reg [3:0], narrowed by Yosys)
    // kept whatever the rule says ('always'): the one-hot netlist, 8 flip-flops, the power-up state S2 kept
    const one = await synthesizeOpen(design, { run: yosysNode, fsm: 'always' });
    assert.deepEqual(one.warnings, [], `${lang}: no warnings`);
    assert.deepEqual(one.depth.fsm.machines, [{ wire: 'st', states: 8 }], lang);
    assert.equal(one.depth.fsm.kept, true);
    assert.equal(utilization(one.cells).flipFlops, 8, lang);
    simulated(design, one, `${lang} one-hot`);
    // by the rule (DEPTH_RULE): tried, kept or not, the netlist kept equal to the RTL
    const high = await synthesizeOpen(design, { run: yosysNode });
    assert.deepEqual(high.warnings, [], `${lang}: no warnings`);
    assert.deepEqual(high.depth.fsm.machines, [{ wire: 'st', states: 8 }]);
    for (const k of ['ns', 'luts', 'slices']) assert.ok(Number.isFinite(high.depth.fsm[k]), `${lang}: ${k}`);
    assert.equal(utilization(high.cells).flipFlops, high.depth.fsm.kept ? 8 : binary, lang);
    simulated(design, high, `${lang} High`);
    // Normal (its own synthesis: not a small design's as at High, #652), and fsm false: not tried, the binary state register
    for (const opts of [{ effort: 'normal', smallRule: { maxLuts: -1 } }, { fsm: false }]) {
      const r = await synthesizeOpen(design, { run: yosysNode, ...opts });
      assert.equal(r.depth.fsm, undefined, `${lang} ${JSON.stringify(opts)}`);
      assert.equal(utilization(r.cells).flipFlops, binary);
      assert.deepEqual(r.warnings, []);
    }
    // 7 states: not tried
    const d7 = elaborate(compile([{ path: lang === 'vhdl' ? 'top.vhd' : 'top.v', lang, text: src(7) }]), 'top');
    const r7 = await synthesizeOpen(d7, { run: yosysNode });
    assert.equal(r7.depth.fsm, undefined, `${lang}: 7 states`);
    assert.equal(utilization(r7.cells).flipFlops, 3);
    assert.deepEqual(r7.warnings, []);
  }
});

// a VHDL integer as the state, starting at integer'left (no initial value), a value it never takes again (#438:
// ITC'99 b14's datawidth): its power-up state cannot be kept one-hot
const INTEGER_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, go : in std_logic; y : out std_logic); end entity;
architecture rtl of top is
  signal n : integer;
begin
  process (clk) begin
    if rising_edge(clk) then
      case n is
${Array.from({ length: 9 }, (_, i) => `        when ${i} => if go = '1' then n <= ${(i + 1) % 9}; end if;`).join('\n')}
        when others => n <= 0;
      end case;
    end if;
  end process;
  y <= '1' when n = 3 or n = 7 else '0';
end architecture;
`;

test('One-hot state machines (#539) with Yosys: an integer\'left start left as it is; a failed run said, the usual netlist kept', { timeout: 300000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { synthesizeOpen, utilization } = await import('../core/synth-open.js');
  const int = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: INTEGER_VHDL }]), 'top');
  const ri = await synthesizeOpen(int, { run: yosysNode });
  assert.equal(ri.depth.fsm, undefined);
  assert.deepEqual(ri.warnings, []);
  simulated(int, ri, 'integer');
  // the second run fails (Yosys crashed): said, the usual netlist (binary, 3 flip-flops) kept
  const design = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: machineVhdl(8) }]), 'top');
  const failing = (args, files, onLine) => (args[args.indexOf('-p') + 1].startsWith('read_rtlil silinx_fsm_marked.il')
    ? Promise.reject(new Error('Yosys failed: out of memory')) : yosysNode(args, files, onLine));
  const r = await synthesizeOpen(design, { run: failing, fsm: 'always' });
  assert.deepEqual(r.warnings, ['Warning: the one-hot encoding of the state machines failed (Yosys failed: out of memory): the usual encoding is kept']);
  assert.deepEqual(r.depth.fsm, { machines: [{ wire: 'st', states: 8 }], ns: null, luts: null, slices: null, kept: false, failed: 'Yosys failed: out of memory' });
  assert.equal(utilization(r.cells).flipFlops, 3);
  simulated(design, r, 'failed');
  // the first run fails: nothing tried, nothing said
  const probeFails = (args, files, onLine) => (/write_rtlil silinx_fsm_pre\.il/.test(args[args.indexOf('-p') + 1]) ? Promise.reject(new Error('Yosys failed')) : yosysNode(args, files, onLine));
  const r2 = await synthesizeOpen(design, { run: probeFails });
  assert.equal(r2.depth.fsm, undefined);
  assert.deepEqual(r2.warnings, []);
});

// a machine of 9 states written one-hot (idle all 0s), tested on all its bits and read bit by bit too (busy): fsm_detect
// refuses it for its users alone, as iwls05-i2c's bit controller (#652); Verilog with an asynchronous reset and no
// power-up value, VHDL with one (state a, not idle)
const FORCED_VERILOG = `module top (input clk, input nrst, input go, input back, input [1:0] cmd, output reg [1:0] y, output z, output busy);
  parameter [7:0] idle = 8'd0, a = 8'b00000001, b = 8'b00000010, c = 8'b00000100, d = 8'b00001000,
                  e = 8'b00010000, f = 8'b00100000, g = 8'b01000000, h = 8'b10000000;
  reg [7:0] st;
  always @(posedge clk or negedge nrst)
    if (!nrst) st <= idle;
    else if (go)
      case (st) // synopsys full_case parallel_case
        idle: case (cmd) 2'd0: st <= a; 2'd1: st <= c; 2'd2: st <= e; default: st <= idle; endcase
        a: st <= b;
        b: st <= back ? a : c;
        c: st <= d;
        d: st <= back ? idle : e;
        e: st <= f;
        f: st <= g;
        g: st <= back ? e : h;
        h: st <= idle;
      endcase
  always @(posedge clk or negedge nrst)
    if (!nrst) y <= 2'b00;
    else case (st) // synopsys full_case parallel_case
      a, d: y <= 2'b01;
      b, g: y <= 2'b10;
      h: y <= 2'b11;
      default: y <= y;
    endcase
  assign z = st == f || st == c;
  assign busy = |st;
endmodule
`;
const FORCED_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, nrst, go, back : in std_logic; cmd : in std_logic_vector(1 downto 0); y : out std_logic_vector(1 downto 0); z, busy : out std_logic); end entity;
architecture rtl of top is
  constant idle : std_logic_vector(7 downto 0) := "00000000";
  constant a : std_logic_vector(7 downto 0) := "00000001";
  constant b : std_logic_vector(7 downto 0) := "00000010";
  constant c : std_logic_vector(7 downto 0) := "00000100";
  constant d : std_logic_vector(7 downto 0) := "00001000";
  constant e : std_logic_vector(7 downto 0) := "00010000";
  constant f : std_logic_vector(7 downto 0) := "00100000";
  constant g : std_logic_vector(7 downto 0) := "01000000";
  constant h : std_logic_vector(7 downto 0) := "10000000";
  signal st : std_logic_vector(7 downto 0) := a;
  signal yr : std_logic_vector(1 downto 0) := "00";
begin
  process (clk, nrst) begin
    if nrst = '0' then st <= idle;
    elsif rising_edge(clk) then
      if go = '1' then
        case st is
          when idle => case cmd is when "00" => st <= a; when "01" => st <= c; when "10" => st <= e; when others => st <= idle; end case;
          when a => st <= b;
          when b => if back = '1' then st <= a; else st <= c; end if;
          when c => st <= d;
          when d => if back = '1' then st <= idle; else st <= e; end if;
          when e => st <= f;
          when f => st <= g;
          when g => if back = '1' then st <= e; else st <= h; end if;
          when h => st <= idle;
          when others => st <= idle;
        end case;
      end if;
    end if;
  end process;
  process (clk, nrst) begin
    if nrst = '0' then yr <= "00";
    elsif rising_edge(clk) then
      if st = a or st = d then yr <= "01"; elsif st = b or st = g then yr <= "10"; elsif st = h then yr <= "11"; end if;
    end if;
  end process;
  y <= yr;
  z <= '1' when st = f or st = c else '0';
  busy <= st(0) or st(1) or st(2) or st(3) or st(4) or st(5) or st(6) or st(7);
end architecture;
`;

test('One-hot state machines (#652) with Yosys: a machine refused for its users alone forced one-hot at both efforts, equal to the RTL, VHDL and Verilog', { timeout: 600000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { synthesizeOpen, utilization, criticalDelay } = await import('../core/synth-open.js');
  for (const [lang, src] of [['verilog', FORCED_VERILOG], ['vhdl', FORCED_VHDL]]) {
    const design = elaborate(compile([{ path: lang === 'vhdl' ? 'top.vhd' : 'top.v', lang, text: src }]), 'top');
    // by the rule: tried, kept (one level and LUTs fewer), 9 state flip-flops and y's 2, no warning (Yosys's on the
    // marked wire not said)
    const high = await synthesizeOpen(design, { run: yosysNode });
    assert.deepEqual(high.warnings, [], `${lang}: no warnings`);
    assert.ok(!high.log.some(l => /fsm_encoding/.test(l)), lang);
    assert.deepEqual(high.depth.fsm.machines, [{ wire: 'st', states: 9 }], lang);
    assert.equal(high.depth.fsm.kept, true, lang);
    assert.equal(utilization(high.cells).flipFlops, 11, lang);
    // every flip-flop with its power-up value (the VHDL's st: state a), the Verilog's y alone without one: a copy of
    // the old register that fsm keeps for a reader it cannot take in gets the old init too (oldStateInits)
    const mod = JSON.parse(high.files[`${high.top}.json`]).modules[high.top];
    const undefinedInit = Object.values(mod.cells).filter(c => /^FD/.test(c.type) && !/^[01]$/.test(String(c.parameters.INIT)));
    assert.equal(undefinedInit.length, lang === 'vhdl' ? 0 : 2, lang);
    simulated(design, high, `${lang} forced`);
    // fsm false (as before #652): the state register as written, 8 flip-flops, slower and larger
    const off = await synthesizeOpen(design, { run: yosysNode, fsm: false });
    assert.equal(off.depth.fsm, undefined);
    assert.deepEqual(off.warnings, []);
    assert.equal(utilization(off.cells).flipFlops, 10, lang);
    const top = high.top;
    assert.ok(criticalDelay(high.files[`${top}.json`], top) < criticalDelay(off.files[`${top}.json`], top), `${lang}: faster`);
    assert.ok(utilization(high.cells).luts < utilization(off.cells).luts, `${lang}: fewer LUTs`);
    // Normal: tried too (the forced machines alone, #539's stay High's), kept, equal to the RTL
    const normal = await synthesizeOpen(design, { run: yosysNode, effort: 'normal', smallRule: { maxLuts: -1 } });
    assert.deepEqual(normal.depth.fsm.machines, [{ wire: 'st', states: 9 }], lang);
    assert.equal(normal.depth.fsm.kept, true, lang);
    assert.equal(utilization(normal.cells).flipFlops, 11, lang);
    assert.deepEqual(normal.warnings, []);
    simulated(design, normal, `${lang} forced, Normal`);
  }
});
