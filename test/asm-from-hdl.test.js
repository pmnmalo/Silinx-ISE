// Tests for core/asm-from-hdl.js (ASM chart extraction from VHDL/Verilog state machines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newModel, normalizeModel, validate, generate } from '../core/asm.js';
import { asmFromHdl, asmLayout, sameAsmStructure, nodeSize } from '../core/asm-from-hdl.js';
import { simulate } from '../core/compile.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------------------
// Charts used for the round trips
// ---------------------------------------------------------------------------------------

// Traffic light: Moore outputs, a 4-bit registered timer (ASMD), implicit action `green`.
function trafficLight() {
  return {
    version: 1, name: 'traffic_fsm', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: false }, encoding: 'binary',
    inputs: [{ name: 'car', width: 1 }],
    outputs: [
      { name: 'red', width: 1, default: '0' }, { name: 'yellow', width: 1, default: '0' }, { name: 'green', width: 1, default: '0' },
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
      { id: 'e1', from: 'sR', to: 'dCar', port: 'next' }, { id: 'e2', from: 'dCar', to: 'sG', port: 'true' },
      { id: 'e3', from: 'dCar', to: 'sR', port: 'false' }, { id: 'e4', from: 'sG', to: 'dT', port: 'next' },
      { id: 'e5', from: 'dT', to: 'oClr', port: 'true' }, { id: 'e6', from: 'dT', to: 'sG', port: 'false' },
      { id: 'e7', from: 'oClr', to: 'sY', port: 'next' }, { id: 'e8', from: 'sY', to: 'sR', port: 'next' },
    ],
    initial: 'sR',
  };
}
function seqDetector() {
  return {
    version: 1, name: 'seq101', lang: 'verilog', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: true }, encoding: 'onehot',
    inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
    nodes: [
      { id: 'a', type: 'state', name: 'S0', actions: [] }, { id: 'da', type: 'decision', cond: 'x == 1' },
      { id: 'b', type: 'state', name: 'S1', actions: [] }, { id: 'db', type: 'decision', cond: 'x' },
      { id: 'c', type: 'state', name: 'S10', actions: [] }, { id: 'dc', type: 'decision', cond: 'x' },
      { id: 'oz', type: 'output', actions: ['z = 1'] },
    ],
    edges: [
      { from: 'a', to: 'da' }, { from: 'da', to: 'b', port: 'true' }, { from: 'da', to: 'a', port: 'false' },
      { from: 'b', to: 'db' }, { from: 'db', to: 'b', port: 'true' }, { from: 'db', to: 'c', port: 'false' },
      { from: 'c', to: 'dc' }, { from: 'dc', to: 'oz', port: 'true' }, { from: 'dc', to: 'a', port: 'false' },
      { from: 'oz', to: 'b' },
    ],
    initial: 'a',
  };
}
// Mealy machine with multi-bit ports and a mix of decision/output shapes.
function mealyMix() {
  return {
    version: 1, name: 'mix_fsm', lang: 'vhdl', clock: 'clk', reset: { name: 'reset', active: 'high', sync: true }, encoding: 'gray',
    description: 'exercise many shapes',
    inputs: [{ name: 'go', width: 1 }, { name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'sel', width: 2 }],
    outputs: [
      { name: 'led', width: 4, default: "4'b0000" }, { name: 'z', width: 1, default: '0' },
      { name: 'flag', width: 1, default: '0' }, { name: 'ack', width: 1, default: '1' },
    ],
    nodes: [
      { id: 's1', type: 'state', name: 'HOLD', actions: ["led = 4'hA"] },
      { id: 'o0', type: 'output', actions: ['z = a ^ b'] },
      { id: 'd1', type: 'decision', cond: 'go' },
      { id: 'd2', type: 'decision', cond: "sel == 2'b01" },
      { id: 'o1', type: 'output', actions: ['ack = 0', 'flag = sel == 3'] },
      { id: 'd3', type: 'decision', cond: '(sel == 2) || a' },
      { id: 's2', type: 'state', name: 'ONE', actions: ['led = 1'] },
      { id: 's3', type: 'state', name: 'TWO', actions: [] },
      { id: 'd4', type: 'decision', cond: 'a && !b' },
      { id: 'o2', type: 'output', actions: ['z = 1'] },
      { id: 's4', type: 'state', name: 'THREE', actions: ["led = sel ^ 2'b10", 'flag = a'] },
      { id: 'd5', type: 'decision', cond: '!go' },
      { id: 'o3', type: 'output', actions: ['ack'] },
    ],
    edges: [
      { from: 's1', to: 'o0' }, { from: 'o0', to: 'd1' },
      { from: 'd1', to: 'd2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
      { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 'd3', port: 'false' },
      { from: 'o1', to: 's2' },
      { from: 'd3', to: 's3', port: 'true' }, { from: 'd3', to: 's4', port: 'false' },
      { from: 's2', to: 'd4' }, { from: 'd4', to: 'o2', port: 'true' }, { from: 'd4', to: 's1', port: 'false' },
      { from: 'o2', to: 's1' },
      { from: 's3', to: 's4' },
      { from: 's4', to: 'd5' }, { from: 'd5', to: 'o3', port: 'true' }, { from: 'd5', to: 's4', port: 'false' },
      { from: 'o3', to: 's1' },
    ],
    initial: 's1',
  };
}
// Registered outputs (ASMD): counter with up/down and a toggling flag; output-only decision.
function counterAsmd() {
  return {
    version: 1, name: 'updown', lang: 'verilog', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: false }, encoding: 'binary',
    inputs: [{ name: 'en', width: 1 }, { name: 'up', width: 1 }],
    outputs: [{ name: 'cnt', width: 4, default: '5', registered: true }, { name: 'tog', width: 1, default: '1', registered: true },
      { name: 'busy', width: 1, default: '0' }],
    nodes: [
      { id: 'i', type: 'state', name: 'IDLE', actions: [] },
      { id: 'de', type: 'decision', cond: 'en' },
      { id: 'r', type: 'state', name: 'COUNT', actions: ['busy'] },
      { id: 'du', type: 'decision', cond: 'up' },
      { id: 'oi', type: 'output', actions: ['cnt = cnt + 1'] },
      { id: 'od', type: 'output', actions: ['cnt = cnt - 1', 'tog = ~tog'] },
      { id: 'dm', type: 'decision', cond: "cnt >= 4'd12 || cnt == 0" },
    ],
    edges: [
      { from: 'i', to: 'de' }, { from: 'de', to: 'r', port: 'true' }, { from: 'de', to: 'i', port: 'false' },
      { from: 'r', to: 'du' }, { from: 'du', to: 'oi', port: 'true' }, { from: 'du', to: 'od', port: 'false' },
      { from: 'oi', to: 'dm' }, { from: 'od', to: 'dm' },
      { from: 'dm', to: 'i', port: 'true' }, { from: 'dm', to: 'r', port: 'false' },
    ],
    initial: 'i',
  };
}

// ---------------------------------------------------------------------------------------
// Hand-written state machines
// ---------------------------------------------------------------------------------------

const VHDL_1P = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity Blink_Ctl is
  port (
    Clk, Rst_n : in std_logic;
    Go         : in std_logic;
    Led        : out std_logic;
    Cnt        : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of Blink_Ctl is
  type state_t is (IDLE, RUN, DONE);
  signal state : state_t;
  signal cnt_r : unsigned(3 downto 0);
  signal led_r : std_logic;
begin
  fsm : process (Clk)
  begin
    if rising_edge(Clk) then
      if Rst_n = '0' then
        state <= IDLE;
        cnt_r <= (others => '0');
        led_r <= '0';
      else
        case state is
          when IDLE =>
            led_r <= '0';
            if Go = '1' then
              state <= RUN;
              cnt_r <= (others => '0');
            end if;
          when RUN =>
            led_r <= '1';
            cnt_r <= cnt_r + 1;
            if cnt_r = 9 then
              state <= DONE;
            end if;
          when DONE =>
            if Go = '0' then
              state <= IDLE;
            end if;
        end case;
      end if;
    end if;
  end process;
  Led <= led_r;
  Cnt <= std_logic_vector(cnt_r);
end architecture;
`;

const VHDL_2P = `library ieee;
use ieee.std_logic_1164.all;

entity det is
  port (clk : in std_logic; rst : in std_logic; x : in std_logic;
        sel : in std_logic_vector(1 downto 0);
        z : out std_logic; y : out std_logic; busy : out std_logic);
end det;

architecture a of det is
  type state_type is (S_IDLE, S_GOT1, S_GOT10, S_PICK);
  signal state, nxt : state_type;
begin
  regs : process (clk, rst)
  begin
    if rst = '1' then
      state <= S_IDLE;
    elsif rising_edge(clk) then
      state <= nxt;
    end if;
  end process;

  z <= '1' when state = S_GOT10 and x = '1' else '0';
  busy <= '1' when state = S_GOT1 or state = S_GOT10 else '0';
  with state select y <= '1' when S_PICK, '0' when others;

  comb : process (state, x, sel)
  begin
    nxt <= state;
    case state is
      when S_IDLE =>
        if x = '1' then
          nxt <= S_GOT1;
        end if;
      when S_GOT1 =>
        if x = '0' then
          nxt <= S_GOT10;
        elsif sel = "11" then
          nxt <= S_PICK;
        end if;
      when S_GOT10 =>
        if x = '1' then
          nxt <= S_GOT1;
        else
          nxt <= S_IDLE;
        end if;
      when S_PICK =>
        case sel is
          when "00" => nxt <= S_IDLE;
          when "01" | "10" => nxt <= S_GOT1;
          when others => null;
        end case;
    end case;
  end process;
end a;
`;

const VERILOG_2P_BITSEL = `module arbiter (
    input  wire clk,
    input  wire reset_n,
    input  wire [1:0] req,
    input  wire done,
    output reg  [1:0] gnt,
    output reg  idle
);
    localparam IDLE = 2'd0, G0 = 2'd1, G1 = 2'd2;
    reg [1:0] cs, ns;

    always @(posedge clk or negedge reset_n)
        if (!reset_n) cs <= IDLE;
        else cs <= ns;

    always @* begin
        ns = cs;
        gnt = 2'b00;
        idle = 1'b0;
        case (cs)
            IDLE: begin
                idle = 1'b1;
                if (req[0] == 1'b1) ns = G0;
                else if (req == 2'b10) ns = G1;
            end
            G0: begin
                gnt = 2'b01;
                if (done) ns = IDLE;
            end
            G1: begin
                gnt = 2'b10;
                if (done && !req[1]) ns = IDLE;
                else if (done) ns = G0;
            end
            default: ns = IDLE;
        endcase
    end
endmodule
`;

const VERILOG_2P = VERILOG_2P_BITSEL.replace("if (req[0] == 1'b1) ns = G0;", "if (req == 2'b01 || req == 2'b11) ns = G0;").replace('if (done && !req[1]) ns = IDLE;', 'if (done && req < 2) ns = IDLE;');

const VERILOG_1P = `module pulse #(parameter WAITING = 2'b00, FIRE = 2'b01, COOL = 2'b11) (
    input clk, input rst, input trig, input [2:0] len,
    output reg pulse_o, output reg [2:0] n
);
    reg [1:0] state;
    always @(posedge clk) begin
        if (rst) begin
            state <= WAITING;
            pulse_o <= 1'b0;
            n <= 3'd0;
        end else begin
            pulse_o <= 1'b0;
            case (state)
                WAITING: if (trig) begin state <= FIRE; n <= len; end
                FIRE: begin
                    pulse_o <= 1'b1;
                    n <= n - 1;
                    if (n == 0) state <= COOL;
                end
                COOL: case (len)
                    3'd0: state <= WAITING;
                    3'd1, 3'd2: begin state <= WAITING; pulse_o <= 1'b1; end
                    default: state <= COOL;
                endcase
                default: state <= WAITING;
            endcase
        end
    end
endmodule
`;

// ---------------------------------------------------------------------------------------
// Simulation helper: random stimulus through a Verilog testbench, outputs sampled per cycle
// ---------------------------------------------------------------------------------------

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

function testbench(m, cycles, seed, lower) {
  const nm = (s) => (lower ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const on = m.reset.active === 'high' ? 1 : 0;
  const r = rng(seed);
  const L = ['module tb;', `  reg clk = 0; reg rst = ${on};`];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`,
    ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
  const fmt = m.outputs.map(() => '%b').join('_');
  for (let c = 0; c < cycles; c++) {
    const asg = m.inputs.map((i) => `i_${i.name} = ${i.width}'d${r() % (1 << i.width)};`).join(' ');
    L.push(`    ${asg} #3 $display("${fmt}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}

/** Simulate `code` (the DUT) with random inputs; returns one output line per cycle. */
function runSim(code, lang, m, { cycles = 300, seed = 7 } = {}) {
  const tb = testbench(m, cycles, seed, lang === 'vhdl');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e7 });
  assert.deepEqual(r.errors, [], `${lang} simulation errors`);
  const out = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
  assert.equal(out.length, cycles);
  return out;
}

const ENCS = ['binary', 'gray', 'onehot', 'enum'];
const MODELS = { ctrl: () => newModel('ctrl_fsm'), trafficLight, seqDetector, mealyMix, counterAsmd };
const headerless = (code) => code.split('\n').filter((l) => !/^(--|\/\/)/.test(l)).join('\n');

/** No two boxes of the chart overlap (sizes as drawn by the editor). */
function overlaps(model) {
  const out = [];
  for (let i = 0; i < model.nodes.length; i++) {
    for (let j = i + 1; j < model.nodes.length; j++) {
      const a = model.nodes[i], b = model.nodes[j];
      const A = nodeSize(a), B = nodeSize(b);
      if (Math.abs(a.x - b.x) * 2 < A.w + B.w && Math.abs(a.y - b.y) * 2 < A.h + B.h) out.push(`${a.id}/${b.id}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Round trips of generated HDL
// ---------------------------------------------------------------------------------------

test('round trip: generate -> asmFromHdl -> generate is identical (all models, encodings, languages)', () => {
  let n = 0;
  for (const [name, make] of Object.entries(MODELS)) {
    for (const lang of ['vhdl', 'verilog']) {
      for (const encoding of ENCS) {
        const m = { ...make(), encoding };
        const code = generate(m, lang).code;
        const { model, warnings } = asmFromHdl(code, { path: `${m.name}.${lang === 'vhdl' ? 'vhd' : 'v'}` });
        const where = `${name}/${lang}/${encoding}`;
        assert.deepEqual(warnings, [], where);
        assert.equal(model.lang, lang, where);
        assert.ok(sameAsmStructure(model, m), `${where}: structure differs`);
        assert.equal(generate(model, lang).code, code, `${where}: regenerated HDL differs`);
        assert.deepEqual(validate(model).filter((d) => d.severity === 'error'), [], where);
        assert.deepEqual(overlaps(model), [], `${where}: overlapping boxes`);
        n++;
      }
    }
  }
  assert.equal(n, Object.keys(MODELS).length * 8);
});

test('round trip: every reset style (sync/async, active high/low)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const sync of [false, true]) {
      for (const active of ['high', 'low']) {
        const m = { ...counterAsmd(), reset: { name: active === 'low' ? 'rst_n' : 'rst', active, sync } };
        const code = generate(m, lang).code;
        const { model } = asmFromHdl(code, { lang });
        assert.deepEqual(model.reset, m.reset);
        assert.equal(generate(model, lang).code, code, `${lang} ${active} ${sync}`);
      }
    }
  }
});

test('round trip without the generator header: same logic, canonical spelling', () => {
  for (const [name, make] of Object.entries(MODELS)) {
    for (const lang of ['vhdl', 'verilog']) {
      for (const encoding of ['binary', 'onehot']) {
        const m = { ...make(), encoding };
        const code = generate(m, lang).code;
        const { model } = asmFromHdl(headerless(code), { lang });
        assert.equal(headerless(generate(model, lang).code), headerless(code), `${name}/${lang}/${encoding}`);
      }
    }
  }
  // the header is what tells Moore actions from an output box right below the state; without
  // it unconditional assignments are Moore actions
  const { model } = asmFromHdl(headerless(generate(mealyMix(), 'verilog').code), { lang: 'verilog' });
  assert.deepEqual(model.nodes.find((n) => n.name === 'HOLD').actions, ["led = 4'hA", 'z = a ^ b']);
});

test('the example chart (ctrl_fsm): states, Moore/Mealy outputs and positions', () => {
  const m = newModel('ctrl_fsm');
  const code = generate(m, 'vhdl').code;
  assert.match(code, /subtype state_t is std_logic_vector\(1 downto 0\);/);
  const { model } = asmFromHdl(code, { path: 'ctrl_fsm.vhd' });
  assert.equal(model.name, 'ctrl_fsm');
  assert.deepEqual(model.nodes.filter((n) => n.type === 'state').map((n) => [n.name, n.actions]),
    [['IDLE', ['ready = 1']], ['RUN', ['busy = 1']], ['FINISH', ['busy = 1', 'ready = 1']]]);
  assert.deepEqual(model.nodes.filter((n) => n.type !== 'state').map((n) => n.cond || n.actions),
    ['start', ['load = 1'], 'done']);
  // automatic layout: one column, top-down, like the hand-drawn example
  assert.deepEqual(model.nodes.map((n) => [n.x, n.y]).slice(0, 5), m.nodes.map((n) => [n.x, n.y]).slice(0, 5));
  assert.ok(model.nodes.every((n, i) => n.x === 200 && (i === 0 || n.y > model.nodes[i - 1].y)));
});

test('original spelling of conditions/actions, description and encoding come from the header', () => {
  const m = trafficLight();
  m.description = 'pedestrian crossing';
  m.encoding = 'gray'; // with 3 states gray codes differ from binary
  const { model } = asmFromHdl(generate(m, 'verilog').code, { lang: 'verilog' });
  assert.equal(model.description, 'pedestrian crossing');
  assert.equal(model.encoding, 'gray');
  assert.deepEqual(model.nodes.find((n) => n.name === 'GREEN').actions, ['green', 'timer = timer + 1']);
  assert.ok(model.nodes.some((n) => n.cond === "timer == 4'd9"));
  assert.deepEqual(model.outputs.find((o) => o.name === 'timer'), { name: 'timer', width: 4, default: '0', registered: true });
  // with 2 states gray == binary: only the header (or the previous chart) can tell them apart
  const two = { ...newModel('two'), encoding: 'gray' };
  two.nodes = two.nodes.slice(0, 3).concat([{ id: 's2', type: 'state', name: 'RUN', x: 0, y: 0, actions: [] }]);
  two.edges = [{ from: 's1', to: 'd1' }, { from: 'd1', to: 'o1', port: 'true' }, { from: 'd1', to: 's1', port: 'false' }, { from: 'o1', to: 's2' }, { from: 's2', to: 's1' }];
  const code = generate(two, 'vhdl').code;
  assert.equal(asmFromHdl(code).model.encoding, 'gray');
  assert.equal(asmFromHdl(headerless(code), { lang: 'vhdl' }).model.encoding, 'binary');
  assert.equal(asmFromHdl(headerless(code), { lang: 'vhdl', previous: two }).model.encoding, 'gray');
});

test('generated HDL and the HDL regenerated from the extracted chart simulate the same (also across languages)', () => {
  for (const [name, make] of Object.entries(MODELS)) {
    for (const lang of ['vhdl', 'verilog']) {
      const m = { ...make(), encoding: lang === 'vhdl' ? 'onehot' : 'binary' };
      const code = generate(m, lang).code;
      const { model } = asmFromHdl(code, { lang });
      const ref = runSim(code, lang, m, { seed: 11 });
      assert.deepEqual(runSim(generate(model, lang).code, lang, m, { seed: 11 }), ref, `${name}/${lang}`);
      const other = lang === 'vhdl' ? 'verilog' : 'vhdl';
      assert.deepEqual(runSim(generate(model, other).code, other, m, { seed: 11 }), ref, `${name}/${lang} -> ${other}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Hand-written state machines
// ---------------------------------------------------------------------------------------

/** Extract, then check that the original and the regenerated HDL (both languages) behave the same. */
function checkHandWritten(src, lang) {
  const { model, warnings } = asmFromHdl(src, { lang });
  assert.deepEqual(validate(model).filter((d) => d.severity === 'error'), []);
  assert.deepEqual(overlaps(model), []);
  const ref = runSim(src, lang, model);
  assert.ok(new Set(ref).size > 1, 'the stimulus exercises the machine');
  for (const l of ['vhdl', 'verilog']) assert.deepEqual(runSim(generate(model, l).code, l, model), ref, `regenerated ${l}`);
  return { model, warnings, byName: (s) => model.nodes.find((n) => n.name === s) };
}

test('hand-written VHDL 1-process FSM (enum type, registered outputs, sync active-low reset)', () => {
  const { model, warnings, byName } = checkHandWritten(VHDL_1P, 'vhdl');
  assert.deepEqual(warnings, []);
  assert.equal(model.name, 'Blink_Ctl'); // original case kept
  assert.equal(model.clock, 'Clk');
  assert.deepEqual(model.reset, { name: 'Rst_n', active: 'low', sync: true });
  assert.equal(model.encoding, 'enum');
  assert.deepEqual(model.inputs, [{ name: 'Go', width: 1 }]);
  assert.deepEqual(model.outputs, [
    { name: 'Led', width: 1, default: '0', registered: true },
    { name: 'Cnt', width: 4, default: '0', registered: true },
  ]);
  assert.deepEqual(byName('RUN').actions, ['Led = 1', 'Cnt = Cnt + 1']);
  assert.ok(model.nodes.some((n) => n.cond === 'Cnt == 9'));
  assert.ok(model.nodes.some((n) => n.cond === 'Go == 0'));
});

test('hand-written VHDL 2-process FSM (when/else and with/select outputs, elsif chain, case on an input)', () => {
  const { model, byName } = checkHandWritten(VHDL_2P, 'vhdl');
  assert.deepEqual(model.nodes.filter((n) => n.type === 'state').map((n) => n.name), ['IDLE', 'GOT1', 'GOT10', 'PICK']);
  assert.deepEqual(byName('GOT10').actions, ['z = x', 'busy = 1']);
  assert.deepEqual(byName('PICK').actions, ['y = 1']);
  assert.ok(model.outputs.every((o) => o.default === '0' && !o.registered));
  // elsif chain = chain of decisions on the false branch; case on sel = case box
  const conds = model.nodes.filter((n) => n.type === 'decision').map((n) => n.cond);
  assert.deepEqual(conds, ['x', 'x == 0', "sel == 2'b11", 'x']);
  const cb = model.nodes.find((n) => n.type === 'case');
  assert.equal(cb.expr, 'sel');
  assert.deepEqual(model.edges.filter((e) => e.from === cb.id).map((e) => [e.port, model.nodes.find((n) => n.id === e.to).name]),
    [['00', 'IDLE'], ['01|10', 'GOT1'], ['others', 'PICK']]);
  const d = model.nodes.find((n) => n.cond === 'x == 0');
  const falseEdge = model.edges.find((e) => e.from === d.id && e.port === 'false');
  assert.equal(model.nodes.find((n) => n.id === falseEdge.to).cond, "sel == 2'b11");
});

test('hand-written Verilog 2-process FSM (localparams, always @*, defaults, else-if)', () => {
  const { model, byName } = checkHandWritten(VERILOG_2P, 'verilog');
  assert.deepEqual(model.reset, { name: 'reset_n', active: 'low', sync: false });
  assert.equal(model.encoding, 'enum'); // binary codes without the fsm_encoding attribute
  assert.deepEqual(model.outputs, [{ name: 'gnt', width: 2, default: '0', registered: false }, { name: 'idle', width: 1, default: '0', registered: false }]);
  assert.deepEqual(byName('G0').actions, ["gnt = 2'b01"]);
  assert.deepEqual(byName('IDLE').actions, ['idle = 1']);
});

test('hand-written Verilog 1-process FSM (parameters, output reg, default before the case, case on an input)', () => {
  const { model, byName } = checkHandWritten(VERILOG_1P, 'verilog');
  assert.deepEqual(model.nodes.filter((n) => n.type === 'state').map((n) => n.name), ['WAITING', 'FIRE', 'COOL']);
  assert.equal(model.encoding, 'gray'); // codes 00/01/11
  assert.deepEqual(model.outputs.map((o) => [o.name, o.registered]), [['pulse_o', true], ['n', true]]);
  // the default `pulse_o <= 1'b0` before the case is overridden in FIRE, kept in the other states
  assert.deepEqual(byName('FIRE').actions, ['pulse_o = 1', 'n = n - 1']);
  assert.deepEqual(byName('WAITING').actions, ['pulse_o = 0']);
  const cb = model.nodes.find((n) => n.type === 'case');
  assert.equal(cb.expr, 'len');
  assert.deepEqual(model.edges.filter((e) => e.from === cb.id).map((e) => e.port), ["3'd0", "3'd1|3'd2", 'others']);
});

test('if-chains on the state, ?: outputs and an async 1-process machine with non-standard codes', () => {
  const tern = `module tern (input clk, input rst, input x, output z, output [1:0] st);
  localparam A = 2'd0, B = 2'd1, C = 2'd2;
  reg [1:0] s, n;
  always @(posedge clk or posedge rst) begin
    if (rst) s <= A;
    else s <= n;
  end
  always @(*) begin
    if (s == A) n = x ? B : A;
    else if (s == B) begin if (!x) n = C; else n = B; end
    else n = A;
  end
  assign z = (s == C) ? x : 1'b0;
  assign st = (s == B) ? 2'b01 : (s == C) ? 2'b10 : 2'b00;
endmodule`;
  const a = checkHandWritten(tern, 'verilog');
  assert.deepEqual(a.model.nodes.map((n) => n.name || n.cond), ['A', 'x', 'B', '!x', 'C']);
  assert.deepEqual(a.byName('C').actions, ['z = x', "st = 2'b10"]);
  const t1 = `library ieee; use ieee.std_logic_1164.all;
entity t1 is port (clk, rst : in std_logic; a : in std_logic; q : out std_logic); end;
architecture r of t1 is
  constant S_A : std_logic_vector(1 downto 0) := "00";
  constant S_B : std_logic_vector(1 downto 0) := "01";
  signal st : std_logic_vector(1 downto 0);
  signal q_i : std_logic;
begin
  process (clk, rst) begin
    if rst = '1' then st <= S_A; q_i <= '1';
    elsif rising_edge(clk) then
      if st = S_A then
        if a = '1' then st <= S_B; q_i <= '0'; end if;
      else
        st <= S_A; q_i <= not q_i;
      end if;
    end if;
  end process;
  q <= q_i;
end;`;
  const b = checkHandWritten(t1, 'vhdl');
  assert.match(b.warnings.join('\n'), /follow no standard encoding/);
  assert.deepEqual(b.model.outputs, [{ name: 'q', width: 1, default: '1', registered: true }]);
  assert.deepEqual(b.byName('B').actions, ['q = ~q']);
});

test('module selection and language detection', () => {
  const two = VERILOG_2P + '\nmodule other(input a, output y); assign y = a; endmodule\n';
  assert.equal(asmFromHdl(two, { path: 'x.v' }).model.name, 'arbiter');
  assert.equal(asmFromHdl(two, { path: 'x.v', module: 'arbiter' }).model.name, 'arbiter');
  assert.throws(() => asmFromHdl(two, { path: 'x.v', module: 'other' }), /no clocked process/);
  assert.throws(() => asmFromHdl(two, { path: 'x.v', module: 'nope' }), /module 'nope' not found/);
  assert.equal(asmFromHdl(VHDL_2P).model.lang, 'vhdl'); // no path: detected from the text
});

// ---------------------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------------------

test('modules that are not pure state machines are rejected with a clear reason', () => {
  const v = (src) => () => asmFromHdl(src, { lang: 'verilog' });
  const extraReg = VERILOG_2P.replace('endmodule', '    reg [7:0] free;\n    always @(posedge clk or negedge reset_n) if (!reset_n) free <= 0; else free <= free + 1;\nendmodule');
  // extra registers are internal registers of the chart (data path), see asm-datapath.test.js
  assert.deepEqual(asmFromHdl(extraReg, { lang: 'verilog' }).model.registers, [{ name: 'free', width: 8, init: '0' }]);
  assert.throws(v(VERILOG_2P.replace('endmodule', '    other u1 (.a(clk));\nendmodule')), /instance 'u1' of 'other' at line 38 is not part of the state machine/);
  assert.throws(v('module c(input a, output y); assign y = a; endmodule'), /no clocked process found/);
  assert.throws(v(VERILOG_2P.replace(/always @\(posedge clk or negedge reset_n\)\n\s*if \(!reset_n\) cs <= IDLE;\n\s*else cs <= ns;/, 'always @(posedge clk) cs <= ns;')),
    /clocked process at line 12 has no reset/);
  assert.throws(v(VERILOG_2P.replace('if (done) ns = IDLE;', 'if (req * 2 == 2) ns = IDLE;')), /line 28 uses the operator '\*'/);
  assert.throws(v(VERILOG_2P.replace('if (done) ns = IDLE;', 'if (req[done]) ns = IDLE;')), /line 28 selects bits of 'req' with a variable index/);
  assert.throws(v(VERILOG_2P.replace('if (done) ns = IDLE;', 'if (req[2]) ns = IDLE;')), /line 28 selects bit 2 of 'req', which has 2 bits/);
  assert.throws(v(VERILOG_2P_BITSEL.replace('input  wire [1:0] req', 'input  wire [2:1] req')), /selects bits of 'req', whose bits are not numbered 1 downto 0/);
  assert.throws(v(VERILOG_2P.replace("idle = 1'b0;\n", '\n')), /output 'idle' has no default value and is not assigned on every path of state 'G0'/);
  assert.throws(v(VERILOG_2P.replace("idle = 1'b1;", 'idle = cs[0];')), /state register 'cs' is used at line 22/);
  assert.throws(v(VERILOG_2P.replace('reg [1:0] cs, ns;', 'reg [1:0] cs, ns;\n    wire t = ns[0];')), /signal 't' at line 11 is not part of the state machine/);
  assert.throws(v('module m(input a; endmodule'), /syntax error at line 1/);
  const vhdlExtra = VHDL_2P.replace('end a;', '  other : process (clk) begin if rising_edge(clk) then busy2 <= x; end if; end process;\nend a;')
    .replace('signal state, nxt : state_type;', 'signal state, nxt : state_type;\n  signal busy2 : std_logic;');
  assert.throws(() => asmFromHdl(vhdlExtra, { lang: 'vhdl' }), /process at line 56 is not part of the state machine \(it drives 'busy2'\)/);
  const vhdlVar = VHDL_2P.replace("  comb : process (state, x, sel)\n  begin", "  comb : process (state, x, sel)\n    variable t : std_logic;\n  begin");
  assert.throws(() => asmFromHdl(vhdlVar, { lang: 'vhdl' }), /process at line \d+ declares variables/);
  assert.throws(() => asmFromHdl(VHDL_2P.replace("z <= '1' when state = S_GOT10 and x = '1' else '0';", "z <= sel(x);"), { lang: 'vhdl' }), /selects bits of 'sel' with a variable index/);
});

test('names that are not valid in a chart are reported', () => {
  const src = VERILOG_1P.replace(/trig/g, 'entity');
  assert.throws(() => asmFromHdl(src, { lang: 'verilog' }), /cannot be represented as an ASM chart:[\s\S]*Input 'entity' is a reserved word in VHDL/);
});

test('state names that are reserved words are accepted (they only appear as S_<name>)', () => {
  const { model } = checkHandWritten(VERILOG_1P.replace(/WAITING/g, 'WAIT'), 'verilog');
  assert.ok(model.nodes.some((n) => n.type === 'state' && n.name === 'WAIT'));
  // the common VHDL enum (S_IDLE, S_WAIT, S_NEXT)
  const vhd = VHDL_2P.replace(/S_GOT10/g, 'S_WAIT').replace(/S_PICK/g, 'S_NEXT');
  const b = checkHandWritten(vhd, 'vhdl');
  assert.deepEqual(b.model.nodes.filter((n) => n.type === 'state').map((n) => n.name), ['IDLE', 'GOT1', 'WAIT', 'NEXT']);
});

// ---------------------------------------------------------------------------------------
// Bit/slice selections and case boxes
// ---------------------------------------------------------------------------------------

const selCaseModel = (expr, ports, over = {}) => ({
  name: 'cs', lang: 'vhdl', clock: 'clk', reset: { name: 'rst' }, encoding: 'binary',
  inputs: [{ name: 'op', width: 4 }, { name: 'go', width: 1 }],
  outputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'st', width: 2, registered: true }],
  registers: [{ name: 'cnt', width: 3, init: '0' }],
  nodes: [
    { id: 's0', type: 'state', name: 'IDLE', actions: ['st = 0'] },
    { id: 'd', type: 'decision', cond: 'go || op[0]' },
    { id: 'c', type: 'case', expr },
    { id: 'o', type: 'output', actions: ['b', 'cnt = cnt + 1'] },
    { id: 's1', type: 'state', name: 'A1', actions: ['a', 'st = 1'] },
    { id: 's2', type: 'state', name: 'A2', actions: ['st = 2'] },
  ],
  edges: [
    { from: 's0', to: 'd' }, { from: 'd', to: 'c', port: 'true' }, { from: 'd', to: 's0', port: 'false' },
    ...ports.map(([port, to]) => ({ from: 'c', to, port })),
    { from: 'o', to: 's2' }, { from: 's1', to: 's0' }, { from: 's2', to: 's0' },
  ],
  initial: 's0', ...over,
});

const SEL_CASES = {
  'full value': selCaseModel('op', [['0|4', 's1'], ["4'd8, 0xC", 'o'], ['others', 's0']]),
  slice: selCaseModel('op[3:2]', [['00', 's1'], ['01|10', 'o'], ['others', 's0']]),
  bit: selCaseModel('op[1]', [['1', 's1'], ['0', 'o']]),
  'registered output': selCaseModel('st', [['0', 's1'], ['1|2', 'o'], ['others', 's0']]),
  'register slice': selCaseModel('cnt[2:1]', [['00', 's1'], ['others', 'o']]),
  'exit like others': selCaseModel('op[3:2]', [['00', 's1'], ['01|10', 'o'], ['11', 's0'], ['others', 's0']]),
  'all values, no others': selCaseModel('op[3:2]', [['00', 's1'], ['01|10', 'o'], ['11', 's0']]),
};

test('charts with bit/slice selections and case boxes convert back from their HDL unchanged', () => {
  for (const [name, m0] of Object.entries(SEL_CASES)) {
    for (const lang of ['vhdl', 'verilog']) {
      const m = { ...clone(m0), lang };
      assert.deepEqual(validate(m).filter((d) => d.severity === 'error'), [], `${name} ${lang}`);
      const g = generate(m, lang);
      const { model, warnings } = asmFromHdl(g.code, { path: g.filename });
      assert.deepEqual(warnings, [], `${name} ${lang}`);
      assert.equal(generate(model, lang).code, g.code, `${name} ${lang}: regenerated file`);
      const cb = model.nodes.find((n) => n.type === 'case');
      assert.equal(cb?.expr, m.nodes.find((n) => n.type === 'case').expr, `${name} ${lang}: case box`);
      assert.equal(model.nodes.filter((n) => n.type === 'decision').length, 1, `${name} ${lang}: no extra decisions`);
      // without the generator header: same behaviour
      const { model: m2 } = asmFromHdl(headerless(g.code), { path: g.filename });
      const ref = runSim(g.code, lang, m, { cycles: 120 });
      for (const l of ['vhdl', 'verilog']) assert.deepEqual(runSim(generate(m2, l).code, l, m, { cycles: 120 }), ref, `${name} ${lang} -> ${l}`);
    }
  }
});

test('hand-written bit selections (req[0], !req[1], VHDL sel(1), sel(1 downto 0)) become chart selections', () => {
  const { model } = checkHandWritten(VERILOG_2P_BITSEL, 'verilog');
  const conds = model.nodes.filter((n) => n.type === 'decision').map((n) => n.cond);
  assert.deepEqual(conds, ["req[0] == 1'b1", "req == 2'b10", 'done', 'done && !req[1]', 'done']);
  const vhd = VHDL_2P.replace('elsif sel = "11" then', 'elsif sel(1) = \'1\' and sel(1 downto 0) /= "10" then');
  const b = checkHandWritten(vhd, 'vhdl');
  assert.ok(b.model.nodes.some((n) => n.cond === "sel[1] && (sel[1:0] != 2'b10)"), b.model.nodes.map((n) => n.cond).join(' / '));
});

// ---------------------------------------------------------------------------------------
// Previous chart, layout, structural comparison
// ---------------------------------------------------------------------------------------

test('a previous chart keeps its ids, positions, edge points, texts and extra fields', () => {
  const prev = newModel('ctrl_fsm');
  prev.nodes.forEach((n, i) => { n.x += 37 * i; n.y += 11 * i; });
  prev.edges.find((e) => e.id === 'e3').points = [{ x: 330, y: 190 }, { x: 330, y: 40 }];
  prev.nodes.find((n) => n.id === 'd2').cond = 'done == 1'; // same VHDL as `done`
  prev.generatedFile = 'ctrl_fsm.vhd';
  const code = generate(prev, 'vhdl').code;
  const { model } = asmFromHdl(headerless(code), { lang: 'vhdl', previous: prev });
  assert.deepEqual(model, normalizeModel(prev));

  // a state added by hand: old boxes stay where they were, new ones do not overlap them
  const edited = code.replace('constant S_FINISH : state_t := "10";', 'constant S_FINISH : state_t := "10";\n    constant S_EXTRA  : state_t := "11";')
    .replace("            when S_FINISH =>\n                state_next <= S_IDLE;",
      "            when S_FINISH =>\n                if start = '1' then\n                    state_next <= S_EXTRA;\n                else\n                    state_next <= S_IDLE;\n                end if;\n            when S_EXTRA =>\n                state_next <= S_IDLE;");
  assert.notEqual(edited, code);
  const r = asmFromHdl(edited, { lang: 'vhdl', previous: prev });
  assert.match(r.warnings.join('\n'), /changed by hand/);
  for (const n of prev.nodes) {
    const k = r.model.nodes.find((x) => x.id === n.id);
    assert.deepEqual([k.x, k.y], [n.x, n.y], n.id);
  }
  assert.equal(r.model.nodes.length, prev.nodes.length + 2);
  assert.deepEqual(overlaps(r.model), []);
  assert.deepEqual(r.model.edges.find((e) => e.id === 'e3').points, [{ x: 330, y: 190 }, { x: 330, y: 40 }]);
  assert.equal(new Set(r.model.edges.map((e) => e.id)).size, r.model.edges.length);
  assert.equal(new Set(r.model.nodes.map((n) => n.id)).size, r.model.nodes.length);
  assert.equal(r.model.generatedFile, 'ctrl_fsm.vhd');
});

test('asmLayout: top-down by BFS order, decisions/outputs below their state, no overlaps', () => {
  for (const make of Object.values(MODELS)) {
    const m = asmLayout(normalizeModel(make()));
    assert.deepEqual(overlaps(m), []);
    const states = m.nodes.filter((n) => n.type === 'state');
    assert.equal(states.find((s) => s.id === m.initial).y, 80);
    assert.ok(states.every((s) => s.x === 200));
    // every box of a block lies between its state and the next state below
    const ys = states.map((s) => s.y).sort((a, b) => a - b);
    for (const n of m.nodes.filter((x) => x.type !== 'state')) assert.ok(n.y > ys[0]);
  }
  const m = asmLayout(normalizeModel(seqDetector()));
  const order = m.nodes.filter((n) => n.type === 'state').sort((a, b) => a.y - b.y).map((n) => n.name);
  assert.deepEqual(order, ['S0', 'S1', 'S10']);
});

test('sameAsmStructure ignores positions/ids/spelling but not behaviour', () => {
  const a = newModel('ctrl_fsm');
  const b = clone(a);
  b.nodes.forEach((n) => { n.x = 0; n.y = 0; n.id = `n_${n.id}`; });
  b.edges.forEach((e) => { e.from = `n_${e.from}`; e.to = `n_${e.to}`; e.id = `x${e.id}`; });
  b.initial = 'n_s1';
  const d1 = b.nodes.find((n) => n.id === 'n_d1');
  d1.cond = 'start == 0'; // inverted decision with swapped branches
  for (const e of b.edges) if (e.from === 'n_d1') e.port = e.port === 'true' ? 'false' : 'true';
  b.nodes.find((n) => n.id === 'n_o1').actions = ["load = 1'b1"];
  assert.ok(sameAsmStructure(a, b));
  const c = clone(a);
  c.edges.find((e) => e.id === 'e7').to = 's1';
  assert.ok(!sameAsmStructure(a, c));
  const d = clone(a);
  d.nodes.find((n) => n.id === 's2').actions = ['busy = 1', 'load = 1'];
  assert.ok(!sameAsmStructure(a, d));
  assert.ok(!sameAsmStructure(a, { ...a, encoding: 'gray' }));
});
