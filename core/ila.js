// Silinx - the logic analyzer's capture core (#3176, as ChipScope's / Vivado's ILA): the signals to watch (the
// probes) sampled on the design's clock into a block RAM, a trigger, and a user data register on the JTAG clock
// through which the PC arms it and reads the samples (the BSCAN primitive's outputs: BSCAN_SPARTAN3's DRCK1 as tck,
// SEL1, CAPTURE, SHIFT, TDI, its TDO1). The module is generated per capture, in VHDL or Verilog, from its settings
// (kept in its header line, `-- silinx-wizard: {...}`, as the Block Memory wizard's, core/blockram.js). The host's
// side of the protocol (the scans to send, the readout read back into a capture): core/ila-capture.js.
//
// The capture clock's side: once armed, the samples go into a circular buffer of `depth` words, one per clock; the
// first `pre` samples fill the part before the trigger, then the trigger is looked for; the sample that meets it is
// written with the others, and depth - pre - 1 more after it, then the core stops (done). The trigger: conditions on
// the probes (= / != a value; a rising, falling edge of a bit; a change of a probe, by its previous sample), all of
// them (and) or any (or); none: the first sample after the fill.
//
// The JTAG side: a data register of R = max(width, 18) bits, shifted least significant bit first (tdo: its bit 0,
// tdi into its top bit). At a capture (sel and capture on a rising tck) the core runs the command the register holds,
// its two low bits (the previous scan's first two bits shifted in), and loads the word the command reads:
//   0 status   the status word
//   1 arm      a new capture (the status word, its arm bit already toggled)
//   2 read     the next sample (oldest first), then the read address steps
//   3 rewind   the read address to the oldest sample of the capture (the status word)
// The status word: bit 0 armed (capturing), 1 triggered, 2 done, 3 the arm toggle (the JTAG side's), 4 its
// acknowledge (the capture clock's: equal to bit 3 once the arm crossed), 9..5 log2(depth), 17..10 width - 1. Arm
// crosses into the capture clock as a toggle through two flip-flops; the flags cross back the same way. A capture is
// complete when the status is done with its acknowledge equal to its arm toggle.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   planCapture(spec)     { width, regBits, addrBits, slices: { probe: [lo, hi] }, memory (planMemory's), chunks, errors }
//   captureModule(spec)   { code, plan }; code '' when the plan has errors
//   CAPTURE_OPS           the trigger's operators

import { wizardLine } from './clocking.js';
import { planMemory, bramShapes } from './blockram.js';
import { identError } from './modgen.js';

const CAPTURE_OPS = ['=', '!=', 'rise', 'fall', 'change'];
export const STATUS_BITS = 18;
const MIN_DEPTH = 16, MAX_DEPTH = 16384, MAX_WIDTH = 256;
const PORTS = ['clk', 'probe', 'tck', 'sel', 'capture', 'shift', 'tdi', 'tdo'];

const log2 = n => { let k = 0; while ((1 << k) < n) k++; return k; };
const bigOf = v => { try { return typeof v === 'bigint' ? v : BigInt(typeof v === 'string' ? v.trim() : v); } catch { return null; } };

/**
 * A capture's plan. spec: { name, lang, family, depth, pre, probes: [{ name, width }], trigger: { combine: 'and' |
 * 'or', conditions: [{ probe, op, value }] } } -> { width (the probes' bits), regBits (R), addrBits, slices (each
 * probe's bits in the sample word, the first probe the lowest), memory (the block RAMs: planMemory's, null on a family
 * it does not plan), errors }.
 */
export function planCapture(spec) {
  const errors = [];
  const probes = Array.isArray(spec.probes) ? spec.probes : [];
  const D = +spec.depth, pre = +spec.pre;
  const slices = {};
  let width = 0;
  if (!probes.length) errors.push('A capture watches one probe or more.');
  const seen = new Set();
  for (const p of probes) {
    const e = identError(p.name, spec.lang);
    if (e) { errors.push(`Probe ${e}.`); continue; }
    if (seen.has(String(p.name).toLowerCase())) { errors.push(`Probe '${p.name}' is given twice.`); continue; }
    seen.add(String(p.name).toLowerCase());
    const w = +p.width;
    if (!(Number.isInteger(w) && w >= 1)) { errors.push(`Probe '${p.name}': the width is a whole number of bits from 1.`); continue; }
    slices[p.name] = [width, width + w - 1];
    width += w;
  }
  if (width > MAX_WIDTH) errors.push(`The probes take ${width} bits: at most ${MAX_WIDTH}.`);
  if (!(Number.isInteger(D) && D >= MIN_DEPTH && D <= MAX_DEPTH && (D & (D - 1)) === 0)) errors.push(`The depth is a power of 2 from ${MIN_DEPTH} to ${MAX_DEPTH} samples.`);
  else if (!(Number.isInteger(pre) && pre >= 0 && pre < D)) errors.push(`The samples before the trigger are a whole number from 0 to ${D - 1}.`);
  const trig = spec.trigger || {};
  if (!['and', 'or'].includes(trig.combine ?? 'and')) errors.push("The trigger's conditions combine as 'and' or 'or'.");
  for (const c of trig.conditions || []) {
    const s = slices[c.probe];
    if (!s) { errors.push(`The trigger's probe '${c.probe}' is not one of the capture's.`); continue; }
    const w = s[1] - s[0] + 1;
    if (!CAPTURE_OPS.includes(c.op)) errors.push(`The trigger's operator '${c.op}' is not one of ${CAPTURE_OPS.join(', ')}.`);
    else if ((c.op === 'rise' || c.op === 'fall') && w !== 1) errors.push(`The trigger's ${c.op === 'rise' ? 'rising' : 'falling'} edge is of a probe of one bit ('${c.probe}' has ${w}).`);
    else if (c.op === '=' || c.op === '!=') {
      const v = bigOf(c.value);
      if (v === null || v < 0n || v >= (1n << BigInt(w))) errors.push(`The trigger's value of '${c.probe}' is a whole number from 0 to ${(1n << BigInt(w)) - 1n}.`);
    }
  }
  if (identError(spec.name, spec.lang)) errors.push(`The module's name: ${identError(spec.name, spec.lang)}.`);
  else if (PORTS.includes(String(spec.name).toLowerCase())) errors.push(`The module's name '${spec.name}' is one of its ports'.`);
  const mem = w => planMemory({ family: spec.family, kind: 'ram', ports: 'dual', width: w, depth: D, style: 'inferred' });
  let memory = errors.length ? null : spec.family === 'artix7' ? xc7Memory(width, D) : !['spartan3e', 'spartan6'].includes(spec.family) ? null : mem(width);
  // (the Spartan-3E: the memory in arrays no wider than the data bits of the widest block that holds the depth, so that no
  // probe bit is a parity bit only the write port has: ISE's DRC warns of a port writing parity bits it does not read,
  // PhysDesignRules:1060; the packer's parityToData moves such a bit to a free data bit, none left when the probes fill
  // the block's: 17 to 18 bits of 1024 samples, 9 of 2048, 33 to 36 of 512, measured on the open flow's routes)
  const deep = memory && spec.family === 'spartan3e' ? bramShapes('spartan3e').filter(x => x.depth >= D).sort((a, b) => b.width - a.width)[0] : null;
  const chunk = deep?.parity ? deep.data : width;
  const chunks = [];
  for (let lo = 0; lo < width; lo += chunk) chunks.push([lo, Math.min(width, lo + chunk) - 1]);
  if (memory && chunks.length > 1) {
    const parts = chunks.map(([lo, hi]) => mem(hi - lo + 1));
    memory = { ...memory, cols: null, rows: null, blocks: parts.reduce((n, m) => n + m.blocks, 0), halves: parts.reduce((n, m) => n + m.halves, 0), parts };
  }
  return { width, regBits: Math.max(width, STATUS_BITS), addrBits: errors.length ? 0 : log2(D), slices, memory, chunks, errors };
}

// the edge the samples are written on (see above)
const fallingWrite = spec => spec.family === 'artix7';

// the 7-series' sample memory (#3767), synthesis's to infer: its 18 Kbit blocks (RAMB18E1; a RAMB36E1 is two), the
// fewest of a shape that holds the depth (512 x 36 as a simple dual port, 1K x 18 … 16K x 1), or distributed RAM when
// that costs less by Yosys's memory_libmap (a block 129, a RAM64M of 3 bits x 64 words 8: lutrams_xc5v.txt, brams_xc4v.txt)
const XC7_SHAPES = [[36, 512], [18, 1024], [9, 2048], [4, 4096], [2, 8192], [1, 16384]];
function xc7Memory(width, depth) {
  const blocks = Math.min(...XC7_SHAPES.map(([w, d]) => Math.ceil(width / w) * Math.ceil(depth / d)));
  if (8 * Math.ceil(width / 3) * Math.ceil(depth / 64) < 129 * blocks) return { family: 'artix7', primName: 'distributed RAM', blocks: 0, halves: 0 };
  return { family: 'artix7', primName: 'RAMB18E1', blocks, halves: blocks };
}

// the sample memory's arrays: [name, lo, hi] (one, mem, for the whole word; mem0, mem1… for the chunks of planCapture)
function memsOf(plan) {
  const whole = plan.chunks.length === 1;
  return { whole, mems: plan.chunks.map(([lo, hi], k) => [whole ? 'mem' : `mem${k}`, lo, hi]) };
}

/** The module of a capture spec (its `name`, `lang`, planCapture's settings): { code, plan }. */
export function captureModule(spec) {
  const plan = planCapture(spec);
  if (plan.errors.length) return { code: '', plan };
  return { code: spec.lang === 'verilog' ? verilogOf(spec, plan) : vhdlOf(spec, plan), plan };
}

// the probes the trigger reads the previous sample of (an edge, a change)
const prevProbes = spec => [...new Set((spec.trigger?.conditions || []).filter(c => ['rise', 'fall', 'change'].includes(c.op)).map(c => c.probe))];

const describe = (spec, plan, c) => [
  `${c} Logic analyzer core (Silinx, #3176): ${plan.width} bit(s) of probes (${spec.probes.map(p => `${p.name}${+p.width > 1 ? `[${p.width}]` : ''}`).join(', ')}),`,
  `${c} ${spec.depth} samples on clk, ${spec.pre} before the trigger: ${triggerText(spec)}.`,
  `${c} The PC arms it and reads it through the JTAG (tck, sel, capture, shift, tdi, tdo: a BSCAN's user register).`,
  `${c} Do not edit: the module is generated from the line above.`,
];
/** The trigger in words: "count = 20 and tick rises", "the first sample". */
export function triggerText(spec) {
  const cs = spec.trigger?.conditions || [];
  if (!cs.length) return 'the first sample';
  const one = c => (c.op === 'rise' ? `${c.probe} rises` : c.op === 'fall' ? `${c.probe} falls` : c.op === 'change' ? `${c.probe} changes` : `${c.probe} ${c.op} ${bigOf(c.value)}`);
  return cs.map(one).join(` ${spec.trigger.combine || 'and'} `);
}

// the trigger's expression: VHDL's a boolean, Verilog's a bit
function trigExpr(spec, plan, v) {
  const cs = spec.trigger?.conditions || [];
  if (!cs.length) return null;
  const sl = (sig, [lo, hi]) => (lo === hi ? (v ? `${sig}[${lo}]` : `${sig}(${lo})`) : v ? `${sig}[${hi}:${lo}]` : `${sig}(${hi} downto ${lo})`);
  const one = c => {
    const s = plan.slices[c.probe], w = s[1] - s[0] + 1, p = sl('probe', s), q = sl('prev', s);
    if (c.op === 'rise') return v ? `(${p} & ~${q})` : `(${p} = '1' and ${q} = '0')`;
    if (c.op === 'fall') return v ? `(~${p} & ${q})` : `(${p} = '0' and ${q} = '1')`;
    if (c.op === 'change') return v ? `(${p} != ${q})` : `(${p} /= ${q})`;
    const x = bigOf(c.value).toString(2).padStart(w, '0');
    const lit = v ? `${w}'b${x}` : w === 1 ? `'${x}'` : `"${x}"`;
    return v ? `(${p} ${c.op === '=' ? '==' : '!='} ${lit})` : `(${p} ${c.op === '=' ? '=' : '/='} ${lit})`;
  };
  const op = spec.trigger.combine === 'or' ? (v ? ' | ' : ' or ') : v ? ' & ' : ' and ';
  return cs.map(one).join(op);
}

// the states of the capture clock's side
const IDLE = 0, FILL = 1, WAIT = 2, AFTER = 3;

function vhdlOf(spec, plan) {
  const W = plan.width, R = plan.regBits, A = plan.addrBits, D = +spec.depth, pre = +spec.pre, post = D - pre - 1;
  const { mems, whole } = memsOf(plan);
  const prev = prevProbes(spec).length > 0, t = trigExpr(spec, plan, false);
  const vec = n => `std_logic_vector(${n - 1} downto 0)`;
  const bits = (x, n) => `"${x.toString(2).padStart(n, '0')}"`;
  const st = s => bits(s, 2);
  const after = post ? [`          state <= ${st(AFTER)};`, "          cnt <= (others => '0');"] : ["          done <= '1';", `          state <= ${st(IDLE)};`];
  const status = [...(R > STATUS_BITS ? [`"${'0'.repeat(R - STATUS_BITS)}"`] : []), bits(W - 1, 8), bits(A, 5), 'ack_s(1)', 'arm_t', 'done_s(1)', 'trig_s(1)', 'armed_s(1)'].join(' & ');
  const ports = [['clk', 'in ', 'std_logic'], ['probe', 'in ', vec(W)], ['tck', 'in ', 'std_logic'], ['sel', 'in ', 'std_logic'], ['capture', 'in ', 'std_logic'],
    ['shift', 'in ', 'std_logic'], ['tdi', 'in ', 'std_logic'], ['tdo', 'out', 'std_logic']].map(([n, d, ty]) => `${n.padEnd(7)} : ${d} ${ty}`);
  return [
    wizardLine(spec, 'vhdl'), ...describe(spec, plan, '--'),
    'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'use IEEE.NUMERIC_STD.ALL;', '',
    `entity ${spec.name} is`, `  port (${ports.join(';\n        ')});`, `end ${spec.name};`, '',
    `architecture rtl of ${spec.name} is`,
    ...mems.flatMap(([n, lo, hi]) => [`  type ${n}_t is array (0 to ${D - 1}) of ${vec(hi - lo + 1)};`, `  signal ${n} : ${n}_t := (others => (others => '0'));`]),
    '  -- the capture clock\'s side: the state (0 idle, 1 filling the samples before the trigger, 2 waiting for it, 3 after it)',
    "  signal state : std_logic_vector(1 downto 0) := \"00\";",
    `  signal wptr, cnt : unsigned(${A - 1} downto 0) := (others => '0');`,
    ...(prev ? [`  signal prev : ${vec(W)} := (others => '0');`] : []),
    "  signal arm_s : std_logic_vector(2 downto 0) := \"000\";",
    "  signal we, trig, ack, triggered, done : std_logic := '0';",
    '  -- the JTAG side: the data register, the read address and word, the arm toggle, the flags crossed',
    `  signal sr, status : ${vec(R)} := (others => '0');`,
    `  signal raddr : unsigned(${A - 1} downto 0) := (others => '0');`,
    `  signal rdata : ${vec(W)} := (others => '0');`,
    "  signal arm_t : std_logic := '0';",
    "  signal ack_s, armed_s, trig_s, done_s : std_logic_vector(1 downto 0) := \"00\";",
    'begin',
    `  we <= '0' when state = ${st(IDLE)} else '1';`,
    t ? `  trig <= '1' when ${t} else '0';` : "  trig <= '1';",
    '  process (clk)', '  begin', `    if ${fallingWrite(spec) ? 'falling' : 'rising'}_edge(clk) then`,
    ...mems.map(([n, lo, hi]) => `      if we = '1' then ${n}(to_integer(wptr)) <= ${whole ? 'probe' : `probe(${hi} downto ${lo})`}; end if;`), '    end if;', '  end process;', '',
    '  process (clk)', '  begin', '    if rising_edge(clk) then',
    '      arm_s <= arm_s(1 downto 0) & arm_t;',
    ...(prev ? ['      prev <= probe;'] : []),
    '      if arm_s(2) /= arm_s(1) then',
    '        ack <= arm_s(1);',
    "        triggered <= '0';",
    "        done <= '0';",
    "        cnt <= (others => '0');",
    `        state <= ${st(pre ? FILL : WAIT)};`,
    `      elsif we = '1' then`,
    '        wptr <= wptr + 1;',
    '        cnt <= cnt + 1;',
    ...(pre ? [`        if state = ${st(FILL)} then`, `          if cnt = ${pre - 1} then state <= ${st(WAIT)}; end if;`, `        elsif state = ${st(WAIT)} then`]
      : [`        if state = ${st(WAIT)} then`]),
    "          if trig = '1' then",
    "            triggered <= '1';",
    ...after.map(l => `  ${l}`),
    '          end if;',
    ...(post ? ['        else', `          if cnt = ${post - 1} then`, "            done <= '1';", `            state <= ${st(IDLE)};`, '          end if;'] : []),
    '        end if;',
    '      end if;', '    end if;', '  end process;', '',
    `  status <= ${status};`,
    '  process (tck)', '  begin', '    if rising_edge(tck) then',
    "      ack_s <= ack_s(0) & ack;",
    `      armed_s <= armed_s(0) & we;`,
    '      trig_s <= trig_s(0) & triggered;',
    '      done_s <= done_s(0) & done;',
    ...mems.map(([n, lo, hi]) => `      ${whole ? 'rdata' : `rdata(${hi} downto ${lo})`} <= ${n}(to_integer(raddr));`),
    "      if sel = '1' and capture = '1' then",
    '        if sr(1 downto 0) = "01" then',
    '          arm_t <= not arm_t;',
    `          sr <= status(${R - 1} downto 4) & not arm_t & status(2 downto 0);`,
    '        elsif sr(1 downto 0) = "10" then',
    `          sr <= ${R > W ? `"${'0'.repeat(R - W)}" & ` : ''}rdata;`,
    '          raddr <= raddr + 1;',
    '        elsif sr(1 downto 0) = "11" then',
    '          raddr <= wptr;',
    '          sr <= status;',
    '        else',
    '          sr <= status;',
    '        end if;',
    "      elsif sel = '1' and shift = '1' then",
    `        sr <= tdi & sr(${R - 1} downto 1);`,
    '      end if;', '    end if;', '  end process;',
    '  tdo <= sr(0);',
    'end rtl;', '',
  ].join('\n');
}

function verilogOf(spec, plan) {
  const W = plan.width, R = plan.regBits, A = plan.addrBits, D = +spec.depth, pre = +spec.pre, post = D - pre - 1;
  const { mems, whole } = memsOf(plan);
  const prev = prevProbes(spec).length > 0, t = trigExpr(spec, plan, true);
  const after = post ? [`          state <= 2'd${AFTER};`, '          cnt <= 0;'] : ['          done <= 1\'b1;', `          state <= 2'd${IDLE};`];
  const status = `{${[...(R > STATUS_BITS ? [`${R - STATUS_BITS}'b0`] : []), `8'd${W - 1}`, `5'd${A}`, 'ack_s[1]', 'arm_t', 'done_s[1]', 'trig_s[1]', 'armed_s[1]'].join(', ')}}`;
  return [
    wizardLine(spec, 'verilog'), ...describe(spec, plan, '//'), '`timescale 1ns / 1ps', '',
    `module ${spec.name} (`,
    '  input  wire clk,', `  input  wire [${W - 1}:0] probe,`, '  input  wire tck,', '  input  wire sel,', '  input  wire capture,', '  input  wire shift,', '  input  wire tdi,', '  output wire tdo', ');', '',
    ...mems.map(([n, lo, hi]) => `  reg [${hi - lo}:0] ${n} [0:${D - 1}];`), '  integer i;',
    `  initial for (i = 0; i < ${D}; i = i + 1) begin ${mems.map(([n, lo, hi]) => `${n}[i] = ${hi - lo + 1}'h0;`).join(' ')} end`,
    '  // the capture clock\'s side: the state (0 idle, 1 filling the samples before the trigger, 2 waiting for it, 3 after it)',
    "  reg [1:0] state = 2'd0;",
    `  reg [${A - 1}:0] wptr = ${A}'d0, cnt = ${A}'d0;`,
    ...(prev ? [`  reg [${W - 1}:0] prev = ${W}'h0;`] : []),
    "  reg [2:0] arm_s = 3'd0;",
    "  reg ack = 1'b0, triggered = 1'b0, done = 1'b0;",
    `  wire we = state != 2'd${IDLE};`,
    `  wire trig = ${t || "1'b1"};`,
    '  // the JTAG side: the data register, the read address and word, the arm toggle, the flags crossed',
    `  reg [${R - 1}:0] sr = ${R}'h0;`,
    `  reg [${A - 1}:0] raddr = ${A}'d0;`,
    `  reg [${W - 1}:0] rdata = ${W}'h0;`,
    "  reg arm_t = 1'b0;",
    "  reg [1:0] ack_s = 2'd0, armed_s = 2'd0, trig_s = 2'd0, done_s = 2'd0;",
    `  wire [${R - 1}:0] status = ${status};`, '',
    ...mems.map(([n, lo, hi]) => `  always @(${fallingWrite(spec) ? 'negedge' : 'posedge'} clk) if (we) ${n}[wptr] <= ${whole ? 'probe' : `probe[${hi}:${lo}]`};`), '',
    '  always @(posedge clk) begin',
    '    arm_s <= {arm_s[1:0], arm_t};',
    ...(prev ? ['    prev <= probe;'] : []),
    '    if (arm_s[2] != arm_s[1]) begin',
    '      ack <= arm_s[1];',
    "      triggered <= 1'b0;",
    "      done <= 1'b0;",
    '      cnt <= 0;',
    `      state <= 2'd${pre ? FILL : WAIT};`,
    '    end else if (we) begin',
    '      wptr <= wptr + 1;',
    '      cnt <= cnt + 1;',
    ...(pre ? [`      if (state == 2'd${FILL}) begin`, `        if (cnt == ${A}'d${pre - 1}) state <= 2'd${WAIT};`, `      end else if (state == 2'd${WAIT}) begin`]
      : [`      if (state == 2'd${WAIT}) begin`]),
    '        if (trig) begin',
    "          triggered <= 1'b1;",
    ...after.map(l => l.replace(/^ {2}/, '')),
    '        end',
    ...(post ? ['      end else begin', `        if (cnt == ${A}'d${post - 1}) begin`, "          done <= 1'b1;", `          state <= 2'd${IDLE};`, '        end'] : []),
    '      end',
    '    end',
    '  end', '',
    '  always @(posedge tck) begin',
    '    ack_s <= {ack_s[0], ack};',
    '    armed_s <= {armed_s[0], we};',
    '    trig_s <= {trig_s[0], triggered};',
    '    done_s <= {done_s[0], done};',
    ...mems.map(([n, lo, hi]) => `    ${whole ? 'rdata' : `rdata[${hi}:${lo}]`} <= ${n}[raddr];`),
    '    if (sel && capture) begin',
    "      if (sr[1:0] == 2'd1) begin",
    '        arm_t <= ~arm_t;',
    `        sr <= {status[${R - 1}:4], ~arm_t, status[2:0]};`,
    "      end else if (sr[1:0] == 2'd2) begin",
    `        sr <= ${R > W ? `{${R - W}'b0, rdata}` : 'rdata'};`,
    '        raddr <= raddr + 1;',
    "      end else if (sr[1:0] == 2'd3) begin",
    '        raddr <= wptr;',
    '        sr <= status;',
    '      end else',
    '        sr <= status;',
    '    end else if (sel && shift)',
    `      sr <= {tdi, sr[${R - 1}:1]};`,
    '  end',
    '  assign tdo = sr[0];', '', 'endmodule', '',
  ].join('\n');
}
