// Tests for core/asm.js (ASM chart model, validation and HDL generators).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newModel, normalizeModel, validate, extractTransitions, stateEncoding,
  generateVerilog, generateVhdl, generate, parseCondition, parseAction,
} from '../core/asm.js';

// Traffic light controller: Moore outputs, a 4-bit registered timer (ASMD style).
function trafficLight() {
  return {
    version: 1, name: 'traffic_fsm', lang: 'vhdl',
    clock: 'clk', reset: { name: 'rst', active: 'high', sync: false },
    encoding: 'binary',
    inputs: [{ name: 'car', width: 1 }],
    outputs: [
      { name: 'red', width: 1, default: '0' },
      { name: 'yellow', width: 1, default: '0' },
      { name: 'green', width: 1, default: '0' },
      { name: 'timer', width: 4, default: '0', registered: true },
    ],
    nodes: [
      { id: 'sR', type: 'state', name: 'RED', x: 0, y: 0, actions: ['red = 1', 'timer = 0'] },
      { id: 'dCar', type: 'decision', x: 0, y: 100, cond: 'car' },
      { id: 'sG', type: 'state', name: 'GREEN', x: 0, y: 200, actions: ['green', 'timer = timer + 1'] },
      { id: 'dT', type: 'decision', x: 0, y: 300, cond: "timer == 4'd9" },
      { id: 'oClr', type: 'output', x: 0, y: 380, actions: ['timer = 0'] },
      { id: 'sY', type: 'state', name: 'YELLOW', x: 0, y: 460, actions: ['yellow = 1'] },
    ],
    edges: [
      { id: 'e1', from: 'sR', to: 'dCar', port: 'next' },
      { id: 'e2', from: 'dCar', to: 'sG', port: 'true' },
      { id: 'e3', from: 'dCar', to: 'sR', port: 'false' },
      { id: 'e4', from: 'sG', to: 'dT', port: 'next' },
      { id: 'e5', from: 'dT', to: 'oClr', port: 'true' },
      { id: 'e6', from: 'dT', to: 'sG', port: 'false' },
      { id: 'e7', from: 'oClr', to: 'sY', port: 'next' },
      { id: 'e8', from: 'sY', to: 'sR', port: 'next' },
    ],
    initial: 'sR',
  };
}

// "101" sequence detector, Mealy output z (overlapping).
function seqDetector() {
  return {
    version: 1, name: 'seq101', lang: 'verilog',
    clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: true },
    encoding: 'onehot',
    inputs: [{ name: 'x', width: 1 }],
    outputs: [{ name: 'z', width: 1, default: '0' }],
    nodes: [
      { id: 'a', type: 'state', name: 'S0', x: 0, y: 0, actions: [] },
      { id: 'da', type: 'decision', x: 0, y: 0, cond: 'x == 1' },
      { id: 'b', type: 'state', name: 'S1', x: 0, y: 0, actions: [] },
      { id: 'db', type: 'decision', x: 0, y: 0, cond: 'x' },
      { id: 'c', type: 'state', name: 'S10', x: 0, y: 0, actions: [] },
      { id: 'dc', type: 'decision', x: 0, y: 0, cond: 'x' },
      { id: 'oz', type: 'output', x: 0, y: 0, actions: ['z = 1'] },
    ],
    edges: [
      { id: '1', from: 'a', to: 'da' }, { id: '2', from: 'da', to: 'b', port: 1 }, { id: '3', from: 'da', to: 'a', port: 0 },
      { id: '4', from: 'b', to: 'db' }, { id: '5', from: 'db', to: 'b', port: 'true' }, { id: '6', from: 'db', to: 'c', port: 'false' },
      { id: '7', from: 'c', to: 'dc' }, { id: '8', from: 'dc', to: 'oz', port: 'true' }, { id: '9', from: 'dc', to: 'a', port: 'false' },
      { id: '10', from: 'oz', to: 'b' },
    ],
    initial: 'a',
  };
}

const errorsOf = (m) => validate(m).filter((d) => d.severity === 'error');

test('example model from newModel() is valid and generates both languages', () => {
  const m = newModel('demo', 'verilog');
  assert.equal(m.name, 'demo');
  assert.equal(m.lang, 'verilog');
  assert.ok(m.nodes.filter((n) => n.type === 'state').length >= 3);
  assert.deepEqual(errorsOf(m), []);
  assert.match(generateVerilog(m), /module demo \(/);
  assert.match(generateVhdl(m), /entity demo is/);
  const g = generate(m);
  assert.equal(g.filename, 'demo.v');
  assert.equal(generate(m, 'vhdl').filename, 'demo.vhd');
});

test('expression parser', () => {
  assert.equal(parseCondition('go && !(cnt == 4\'b1010)').error, undefined);
  assert.equal(parseCondition('a = "101"').ast.op, '==');
  assert.equal(parseCondition('a and not b').ast.op, '&&');
  assert.ok(parseCondition('a +').error);
  assert.ok(parseCondition('').error);
  assert.ok(parseCondition("4'bxx01").error);
  const act = parseAction('ld');
  assert.equal(act.target, 'ld');
  assert.equal(act.ast.v, 1n);
  assert.equal(parseAction('q <= q + 1').ast.op, '+');
  assert.ok(parseAction('= 3').error);
});

test('traffic light: validation and transitions', () => {
  const m = trafficLight();
  assert.deepEqual(errorsOf(m), []);
  const tr = extractTransitions(m);
  const red = tr.find((s) => s.name === 'RED');
  assert.deepEqual(red.mooreActions, ['red = 1', 'timer = 0']);
  assert.equal(red.transitions.length, 2);
  assert.deepEqual(red.transitions.map((t) => [t.conditions.map((c) => c.value), t.nextName]),
    [[[true], 'GREEN'], [[false], 'RED']]);
  const green = tr.find((s) => s.name === 'GREEN');
  const toYellow = green.transitions.find((t) => t.nextName === 'YELLOW');
  assert.deepEqual(toYellow.conditions, [{ nodeId: 'dT', cond: "timer == 4'd9", value: true }]);
  assert.deepEqual(toYellow.mealyActions, [{ nodeId: 'oClr', action: 'timer = 0' }]);
});

test('traffic light: VHDL generation', () => {
  const v = generateVhdl(trafficLight());
  assert.match(v, /library ieee;\s*use ieee\.std_logic_1164\.all;\s*use ieee\.numeric_std\.all;/);
  assert.match(v, /entity traffic_fsm is/);
  assert.match(v, /car\s+: in  std_logic;/);
  assert.match(v, /timer\s+: out std_logic_vector\(3 downto 0\)/);
  assert.match(v, /subtype state_t is std_logic_vector\(1 downto 0\);/);
  assert.match(v, /constant S_RED\s+: state_t := "00";/);
  assert.match(v, /process \(clk, rst\)/);
  assert.match(v, /if rst = '1' then/);
  assert.match(v, /elsif rising_edge\(clk\) then/);
  assert.match(v, /if car = '1' then\s+state_next <= S_GREEN;\s+else\s+state_next <= S_RED;/);
  assert.match(v, /if unsigned\(timer_reg\) = 9 then/);
  assert.match(v, /timer_next <= std_logic_vector\(unsigned\(timer_reg\) \+ 1\);/);
  assert.match(v, /timer_next <= timer_reg;/); // registered output holds by default
  assert.match(v, /red <= '0';/); // default before case: no latches
  assert.match(v, /when others =>/);
  assert.match(v, /timer <= timer_reg;/);
  assert.match(v, /end architecture rtl;/);
  // the combinational process must be sensitive to everything it reads
  assert.match(v, /output_logic : process \(state_reg, timer_reg\)/);
  assert.match(v, /next_state_logic : process \(state_reg, car, timer_reg\)/);
});

test('traffic light: Verilog generation', () => {
  const v = generateVerilog(trafficLight());
  assert.match(v, /module traffic_fsm \(/);
  assert.match(v, /output wire \[3:0\] timer/);
  assert.match(v, /output reg\s+red/);
  assert.match(v, /localparam \[1:0\] S_RED\s+= 2'b00;/);
  assert.match(v, /always @\(posedge clk or posedge rst\)/);
  assert.match(v, /always @\(\*\)/);
  assert.match(v, /if \(timer_reg == 4'd9\) begin/);
  assert.match(v, /timer_next = timer_reg \+ 1;/);
  assert.match(v, /timer_reg <= 4'd0;/);
  assert.match(v, /assign timer = timer_reg;/);
  assert.match(v, /default: state_next = S_RED;/);
  assert.match(v, /endmodule/);
});

test('sequence detector: Mealy output, one-hot, sync active-low reset', () => {
  const m = seqDetector();
  assert.deepEqual(errorsOf(m), []);
  const t = extractTransitions(m).find((s) => s.name === 'S10').transitions;
  assert.deepEqual(t.map((x) => [x.nextName, x.mealyActions.map((a) => a.action)]), [['S1', ['z = 1']], ['S0', []]]);

  const vl = generateVerilog(m);
  assert.match(vl, /localparam \[2:0\] S_S0\s+= 3'b001;/);
  assert.match(vl, /localparam \[2:0\] S_S10\s+= 3'b100;/);
  assert.match(vl, /\/\/ synthesis attribute fsm_encoding of state_reg is user/);
  assert.match(vl, /always @\(posedge clk\) begin\s+if \(!rst_n\) begin/);
  assert.match(vl, /z = 1'b0;/);
  assert.match(vl, /S_S10: begin\s+if \(x\) begin\s+z = 1'b1;\s+end\s+end/);
  // decision with both branches to different states
  assert.match(vl, /if \(x == 1\) begin\s+state_next = S_S1;/);

  const vh = generateVhdl(m);
  assert.match(vh, /process \(clk\)\s+begin\s+if rising_edge\(clk\) then\s+if rst_n = '0' then/);
  assert.match(vh, /constant S_S10 : state_t := "100";/);
  assert.match(vh, /when S_S10 =>\s+if x = '1' then\s+z <= '1';\s+end if;/);
  assert.match(vh, /output_logic : process \(state_reg, x\)/);
});

test('enum and gray encodings', () => {
  const m = trafficLight();
  m.encoding = 'enum';
  const vh = generateVhdl(m);
  assert.match(vh, /type state_t is \(S_RED, S_GREEN, S_YELLOW\);/);
  assert.doesNotMatch(vh, /fsm_encoding/);
  m.encoding = 'gray';
  const codes = stateEncoding(m).map((s) => s.bits);
  assert.deepEqual(codes, ['00', '01', '11']);
  assert.match(generateVerilog(m), /S_YELLOW = 2'b11;/);
});

test('generators are deterministic', () => {
  for (const mk of [trafficLight, seqDetector, () => newModel('x', 'vhdl')]) {
    assert.equal(generateVhdl(mk()), generateVhdl(mk()));
    assert.equal(generateVerilog(mk()), generateVerilog(mk()));
    // normalisation round-trip does not change the output
    assert.equal(generateVhdl(normalizeModel(JSON.parse(JSON.stringify(mk())))), generateVhdl(mk()));
  }
});

test('validation: structural errors', () => {
  const m = trafficLight();
  m.edges = m.edges.filter((e) => e.id !== 'e6'); // decision without 0 branch
  m.nodes.push({ id: 'sX', type: 'state', name: 'red', x: 0, y: 0, actions: [] }); // duplicate (VHDL is case-insensitive) + no exit
  m.nodes.push({ id: 'sU', type: 'state', name: 'LONELY', x: 0, y: 0, actions: [] });
  m.edges.push({ id: 'eU', from: 'sU', to: 'sU', port: 'next' });
  const d = validate(m);
  const msgs = d.map((x) => `${x.severity}:${x.nodeId}:${x.message}`).join('\n');
  assert.match(msgs, /error:dT:.*no 0 \(false\) branch/);
  assert.match(msgs, /error:sX:Duplicate state name 'red'/);
  assert.match(msgs, /error:sX:.*has no exit/);
  assert.match(msgs, /warning:sU:State 'LONELY' is unreachable/);
  assert.throws(() => generateVhdl(m), /error/);
});

test('validation: loops, identifiers, initial state', () => {
  const m = seqDetector();
  // decision loop without a state: S0 -> d1 -> d2 -> d1
  m.nodes.push({ id: 'l1', type: 'decision', x: 0, y: 0, cond: 'x' }, { id: 'l2', type: 'decision', x: 0, y: 0, cond: 'y' });
  m.edges.find((e) => e.id === '9').to = 'l1';
  m.edges.push({ id: 'l1t', from: 'l1', to: 'l2', port: 'true' }, { id: 'l1f', from: 'l1', to: 'a', port: 'false' },
    { id: 'l2t', from: 'l2', to: 'l1', port: 'true' }, { id: 'l2f', from: 'l2', to: 'a', port: 'false' });
  m.nodes.push({ id: 'o2', type: 'output', x: 0, y: 0, actions: ['x = 1', 'nope = 1', 'z = 3'] });
  m.edges.push({ id: 'o2e', from: 'o2', to: 'a' });
  m.initial = 'zzz';
  const d = validate(m);
  const msgs = d.map((x) => `${x.severity}:${x.nodeId}:${x.message}`).join('\n');
  assert.match(msgs, /error:l1:Loop through decision\/output boxes without a state/);
  assert.match(msgs, /error:l2:.*'y' is not a declared input/);
  assert.match(msgs, /error:o2:.*'x' is an input and cannot be assigned/);
  assert.match(msgs, /error:o2:.*'nope' is not a declared output/);
  assert.match(msgs, /warning:o2:.*truncated to 1 bit/);
  assert.match(msgs, /warning:o2:.*cannot be reached from any state/);
  assert.match(msgs, /error:undefined:Initial state 'zzz' is not a state/);
});

test('validation: names and reading combinational outputs', () => {
  const m = trafficLight();
  m.name = 'entity';
  m.inputs.push({ name: 'red', width: 1 }, { name: 'bad__name', width: 1 }, { name: 'w', width: 0 });
  m.nodes.find((n) => n.id === 'dCar').cond = 'car && green';
  const msgs = validate(m).map((x) => x.message).join('\n');
  assert.match(msgs, /'entity' is a reserved word in VHDL/);
  assert.match(msgs, /Output 'red' clashes with input 'red'/);
  assert.match(msgs, /'bad__name' is not a valid identifier/);
  assert.match(msgs, /invalid width 0/);
  assert.match(msgs, /output 'green' is combinational and cannot be read/);
  assert.equal(validate({ nodes: [] }).some((d) => /no states/.test(d.message)), true);
});

test('vector expressions translate to numeric_std in VHDL', () => {
  const m = {
    name: 'alu_ctl', inputs: [{ name: 'a', width: 8 }, { name: 'b', width: 8 }, { name: 'en', width: 1 }],
    outputs: [{ name: 'y', width: 8 }, { name: 'gt', width: 1 }, { name: 'p', width: 4, default: '"1111"' }],
    nodes: [
      { id: 's', type: 'state', name: 'RUN', actions: ['y = a + b', 'gt = a > b', "p = 4'hA", 'y = a ^ b'] },
      { id: 'd', type: 'decision', cond: 'en & (a != 0) || b >= 200' },
    ],
    edges: [{ from: 's', to: 'd' }, { from: 'd', to: 's', port: 'true' }, { from: 'd', to: 's', port: 'false' }],
    initial: 's',
  };
  const d = validate(m);
  assert.equal(d.filter((x) => x.severity === 'error').length, 0, JSON.stringify(d));
  const vh = generateVhdl(m);
  assert.match(vh, /y <= std_logic_vector\(unsigned\(a\) \+ unsigned\(b\)\);/);
  assert.match(vh, /if unsigned\(a\) > unsigned\(b\) then\s+gt <= '1';\s+else\s+gt <= '0';/);
  assert.match(vh, /p <= "1010";/);
  assert.match(vh, /p <= "1111";/); // default
  assert.match(vh, /y <= a xor b;/);
  // decision whose branches go to the same state collapses
  assert.match(vh, /when S_RUN =>\s+state_next <= S_RUN;/);
  const vl = generateVerilog(m);
  assert.match(vl, /y = a \+ b;/);
  assert.match(vl, /p = 4'hA;/);
  assert.match(vl, /p = 4'd15;/);
});

// End-to-end: simulate the generated Verilog and VHDL with the Silinx simulator (core/compile.js)
// and check that both behave identically and correctly. Skipped if the simulator is not available.
test('generated HDL simulates correctly in both languages (seq101 + registered counter)', async (t) => {
  let simulate;
  try { ({ simulate } = await import('../core/compile.js')); } catch { t.skip('core/compile.js not available'); return; }
  const m = seqDetector();
  m.reset = { name: 'rst', active: 'high', sync: false };
  m.outputs.push({ name: 'cnt', width: 4, default: '0', registered: true });
  m.nodes.find((n) => n.id === 'oz').actions.push('cnt = cnt + 1');
  const tb = `module tb;
  reg clk = 0, rst = 1, x = 0; wire z; wire [3:0] cnt;
  seq101 dut(.clk(clk), .rst(rst), .x(x), .z(z), .cnt(cnt));
  always #5 clk = ~clk;
  reg [15:0] pat = 16'b1010_1101_0110_1010;
  integer i;
  initial begin
    #12 rst = 0;
    for (i = 15; i >= 0; i = i - 1) begin x = pat[i]; #4 $display("%0d%0d%0d", x, z, cnt); @(posedge clk); #1; end
    $finish;
  end
endmodule`;
  const results = [];
  for (const lang of ['verilog', 'vhdl']) {
    const g = generate(m, lang);
    const r = simulate([{ path: g.filename, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], `${lang}: ${JSON.stringify(r.errors)}`);
    results.push(r.sim.log.map((e) => e.text).filter((s) => /^\d+$/.test(String(s).trim())).map((s) => String(s).trim()));
  }
  // x z cnt per cycle: "101" detected (Mealy z=1 in the same cycle) at every overlapping occurrence
  const zs = results[0].map((s) => s[1]).join('');
  assert.equal(zs, '0010100101001010');
  assert.equal(results[0][15], '006');
  assert.deepEqual(results[1], results[0]);
});

test('bit and slice selection in conditions: op[4], op[2:1], op(0), op(3 downto 2)', () => {
  const m = newModel('t', 'vhdl');
  m.inputs.push({ name: 'op', width: 5 });
  m.nodes.find((n) => n.id === 'd1').cond = "op[4] && op[2:1] == 2'b10 || op(0) || op(3 downto 2) == 3";
  assert.deepEqual(validate(m), []);
  const vh = generateVhdl(m);
  assert.match(vh, /op\(4\) = '1'/);
  assert.match(vh, /unsigned\(op\(2 downto 1\)\) = 2/);
  assert.match(vh, /unsigned\(op\(3 downto 2\)\) = 3/);
  const vl = generateVerilog({ ...m, lang: 'verilog' });
  assert.match(vl, /op\[4\] && \(op\[2:1\] == 2'b10\)/);
  assert.match(vl, /op\[0\]/);
  m.nodes.find((n) => n.id === 'd1').cond = 'op[5]';
  assert.match(validate(m)[0].message, /index 5 is out of range/);
  assert.ok(parseCondition('op[1:3]').error);
});

test('multi-line description: every header line stays a comment', () => {
  const m = { ...newModel('t', 'vhdl'), description: 'line one\nline two' };
  assert.match(generateVhdl(m), /^-- {15}line two$/m);
  assert.match(generateVerilog({ ...m, lang: 'verilog' }), /^\/\/ {15}line two$/m);
});

// ---- case (multi-way decision) boxes
const caseModel = (over = {}) => ({
  name: 'cs', lang: 'vhdl', clock: 'clk', reset: { name: 'rst' },
  inputs: [{ name: 'op', width: 2 }, { name: 'go', width: 1 }],
  outputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }],
  nodes: [
    { id: 's0', type: 'state', name: 'IDLE', actions: [] },
    { id: 'd', type: 'decision', cond: 'go' },
    { id: 'c', type: 'case', expr: 'op' },
    { id: 'o', type: 'output', actions: ['b'] },
    { id: 's1', type: 'state', name: 'A1', actions: ['a'] },
    { id: 's2', type: 'state', name: 'A2', actions: [] },
  ],
  edges: [
    { from: 's0', to: 'd' }, { from: 'd', to: 'c', port: 'true' }, { from: 'd', to: 's0', port: 'false' },
    { from: 'c', to: 's1', port: '00' }, { from: 'c', to: 'o', port: '01|10' }, { from: 'c', to: 's0', port: 'others' },
    { from: 'o', to: 's2' }, { from: 's1', to: 's0' }, { from: 's2', to: 's0' },
  ],
  initial: 's0',
  ...over,
});

test('case box: VHDL case / Verilog case with grouped values and others', () => {
  assert.deepEqual(validate(caseModel()), []);
  const vh = generateVhdl(caseModel());
  assert.match(vh, /case op is\n\s+when "00" =>\n\s+state_next <= S_A1;\n\s+when "01" \| "10" =>\n\s+state_next <= S_A2;\n\s+when others =>\n\s+state_next <= S_IDLE;\n\s+end case;/);
  assert.match(vh, /case op is\n\s+when "01" \| "10" =>\n\s+b <= '1';\n\s+when others =>\n\s+null;/);
  const vl = generateVerilog(caseModel({ lang: 'verilog' }));
  assert.match(vl, /case \(op\)\n\s+2'b00: state_next = S_A1;\n\s+2'b01, 2'b10: state_next = S_A2;\n\s+default: state_next = S_IDLE;\n\s+endcase/);
  const tr = extractTransitions(caseModel()).find((s) => s.name === 'IDLE').transitions;
  assert.deepEqual(tr.map((t) => t.nextName), ['A1', 'A2', 'IDLE', 'IDLE']);
});

test('case box: labels as literals, coverage, duplicates and errors', () => {
  const m = caseModel();
  m.edges.find((e) => e.port === 'others').port = '3';
  assert.deepEqual(validate(m), []);                               // 00, 01|10, 3: complete
  m.edges.find((e) => e.port === '3').port = "2'b10";
  const msgs = validate(m).map((d) => d.message).join('\n');
  assert.match(msgs, /value 10 is used by the exits '01\|10' and '2'b10'/);
  assert.match(msgs, /1 value\(s\) have no exit \(e\.g\. 11\)/);
  m.edges.find((e) => e.port === "2'b10").port = '7';
  assert.match(validate(m).map((d) => d.message).join('\n'), /'7' does not fit in 2 bits/);
  const m2 = caseModel();
  m2.nodes.find((n) => n.id === 'c').expr = 'op + 1';
  assert.match(validate(m2)[0].message, /must be a signal name or a bit slice/);
});

test('case box on a slice: VHDL if/elsif chain, Verilog case', () => {
  const m = caseModel({ inputs: [{ name: 'op', width: 4 }, { name: 'go', width: 1 }] });
  m.nodes.find((n) => n.id === 'c').expr = 'op[3:2]';
  assert.deepEqual(validate(m), []);
  const vh = generateVhdl(m);
  assert.match(vh, /if op\(3 downto 2\) = "00" then\n\s+state_next <= S_A1;\n\s+elsif op\(3 downto 2\) = "01" or op\(3 downto 2\) = "10" then/);
  assert.match(generateVerilog({ ...m, lang: 'verilog' }), /case \(op\[3:2\]\)/);
});

test('case box: not allowed in every-cycle blocks', () => {
  const m = caseModel();
  m.nodes.push({ id: 'al', type: 'always', name: 'blk', actions: [] }, { id: 'c2', type: 'case', expr: 'op' });
  m.edges.push({ from: 'al', to: 'c2' });
  assert.match(validate(m).map((d) => d.message).join('\n'), /case boxes are not supported in every-cycle blocks/);
});

// ---- names (audit fixes)
test('validation: state names only appear as S_<name> (reserved words allowed); VHDL process labels are taken', () => {
  const m = trafficLight();
  m.nodes.find((n) => n.id === 'sY').name = 'WAIT';
  m.nodes.find((n) => n.id === 'sG').name = 'next';
  assert.deepEqual(errorsOf(m), []);
  assert.match(generateVhdl(m), /constant S_WAIT/);
  for (const label of ['output_logic', 'state_register', 'Next_State_Logic']) {
    const m2 = trafficLight();
    m2.inputs.push({ name: label, width: 1 });
    assert.match(errorsOf(m2).map((d) => d.message).join('\n'), new RegExp(`Input '${label}' clashes with VHDL process label`, 'i'));
  }
  const m3 = trafficLight();
  m3.inputs.push({ name: 'wait', width: 1 });
  assert.match(errorsOf(m3)[0].message, /'wait' is a reserved word/); // ports are still checked
});

// ---- expression sizing: the VHDL must compute what Verilog computes (audit fixes)
const sizingModel = (actions, cond = 'c') => ({
  name: 'sz', clock: 'clk', reset: { name: 'rst' },
  generics: [{ name: 'MASK', default: 12 }],
  inputs: [{ name: 'a', width: 4 }, { name: 'b', width: 3 }, { name: 'c', width: 1 }],
  outputs: [{ name: 'y', width: 5 }, { name: 'z1', width: 1 }, { name: 'z2', width: 1 }, { name: 'z3', width: 1 }, { name: 'z4', width: 1 }, { name: 'z5', width: 1 }],
  nodes: [
    { id: 's0', type: 'state', name: 'S0', actions },
    { id: 'd', type: 'decision', cond },
    { id: 'o', type: 'output', actions: ['z5 = 1'] },
  ],
  edges: [{ from: 's0', to: 'd' }, { from: 'd', to: 'o', port: 'true' }, { from: 'd', to: 's0', port: 'false' }, { from: 'o', to: 's0' }],
  initial: 's0',
});

test('expression sizing: generics in & | ^, unsized literals in truth values, constant folding, comparisons with booleans', async (t) => {
  let simulate;
  try { ({ simulate } = await import('../core/compile.js')); } catch { t.skip('core/compile.js not available'); return; }
  const m = sizingModel([
    'y = b | MASK',                          // MASK is 32 bits wide: b | 01100
    "z1 = !((a & 4'd5) + (a[3] + 1))",       // the 32-bit sum is never 0
    "z2 = ((b ^ 4'd5) | (4'd5 ^ 40)) < a",   // 4'd5 ^ 40 = 45 (not 13)
    'z3 = a == (b < c)',                     // a compared with the truth bit (0 or 1)
    'z4 = 3 == (1 || c)',                    // always false
  ], '(b - 40) << a[2:1]');                  // the 32-bit difference is never 0
  assert.deepEqual(errorsOf(m), []);
  assert.match(generateVhdl(m), /to_unsigned\(MASK, 5\)/);
  const vecs = [];
  for (let a = 0; a < 16; a += 3) for (let b = 0; b < 8; b += 3) for (const c of [0, 1]) vecs.push({ a, b, c });
  const tb = ['module tb;', '  reg clk = 0, rst = 1; reg [3:0] a = 0; reg [2:0] b = 0; reg c = 0;',
    '  wire [4:0] y; wire z1, z2, z3, z4, z5;',
    '  sz dut(.clk(clk), .rst(rst), .a(a), .b(b), .c(c), .y(y), .z1(z1), .z2(z2), .z3(z3), .z4(z4), .z5(z5));',
    '  always #5 clk = ~clk;', '  initial begin', '    #12 rst = 0;',
    ...vecs.map((v) => `    a = ${v.a}; b = ${v.b}; c = ${v.c}; #3 $display("%b_%b%b%b%b%b", y, z1, z2, z3, z4, z5); @(posedge clk); #1;`),
    '    $finish;', '  end', 'endmodule'].join('\n');
  const expect = vecs.map(({ a, b, c }) => `${(b | 12).toString(2).padStart(5, '0')}_00${a === (b < c ? 1 : 0) ? 1 : 0}01`);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generate(m, lang);
    const r = simulate([{ path: g.filename, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], `${lang}: ${JSON.stringify(r.errors)}`);
    const out = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01]{5}_[01]{5}$/.test(s));
    assert.deepEqual(out, expect, lang);
  }
});

test('expression sizing: comparison results mixed with multi-bit values are rejected', () => {
  const msg = (acts, cond) => errorsOf(sizingModel(acts, cond)).map((d) => d.message).join('\n');
  assert.match(msg([], "!(3'b101 < a) & (MASK | b)"), /'&' cannot combine a comparison \(1 bit\) with a 32-bit value/);
  assert.match(msg(['y = (a < b) ^ a']), /'\^' cannot combine a comparison \(1 bit\) with a 4-bit value/);
  assert.match(msg(['y = ~(a < b)']), /'~' cannot invert a comparison inside a 5-bit expression/);
  // 1-bit mixes keep working
  assert.deepEqual(errorsOf(sizingModel(['z1 = (a < b) & c', 'z2 = ~(a < b)', 'z3 = (a < b) == 0'], '(a < b) | (b < c)')), []);
});
