// The traffic example (examples/traffic, the second example): a pedestrian crossing. Its controller
// is a state diagram (src/traffic.fsm.json, a Moore machine) and its lamps a truth table
// (src/lamps.bool.json), each with its VHDL kept in sync (src/traffic.vhd, src/lamps.vhd); the timer
// and the top are plain VHDL, the display the clock example's Verilog. The drawn sources are clean
// and the VHDL shipped is exactly what the FSM editor and the truth table tool write (and reads back
// to the same diagram / table); the diagram has the 7 states and the transitions designed, the table
// its 5 lamp columns; the test bench passes and fails on a wrong design (a wrong transition, a wrong
// lamp, a wrong phase length, a request never cleared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeFsm, validateFsm, generateFsm, fsmEncoding, fsmFromHdl, sameFsm } from '../core/fsm.js';
import { normalizeTable, validateTable, generateTableHdl, truthTableFromModule, dontCaresInHdl } from '../core/logic.js';
import { EXAMPLES, TARGETS, targetName, example, exampleUcf, runTestbench } from './examples-lib.mjs';

const ex = example('traffic');
const read = (f) => fs.readFileSync(path.join(ex.dir, f), 'utf8');
const fsm = JSON.parse(read('src/traffic.fsm.json'));
const tt = JSON.parse(read('src/lamps.bool.json'));
const fsmHdl = read('src/traffic.vhd');
const ttHdl = read('src/lamps.vhd');
const fsmCode = (m) => generateFsm(m, 'vhdl', { source: 'traffic.fsm.json' }).code;
const ttCode = (t) => generateTableHdl(t, 'vhdl', { source: 'lamps.bool.json' }).code;
const PHASES = ['CARS', 'CARS_YELLOW', 'ALL_RED', 'WALK', 'WALK_END', 'ALL_RED_2', 'NIGHT'];

test('traffic: the second example, after gates', () => {
  assert.deepEqual(EXAMPLES.slice(0, 3), ['gates', 'traffic', 'blinky']);
});

test('traffic: the project (top top, test bench tb_traffic, Basys2, VHDL), its sources', () => {
  assert.deepEqual([ex.project.name, ex.project.top, ex.project.simTop, ex.project.board, ex.project.device.part, ex.project.preferredLanguage, ex.project.constraints],
    ['traffic', 'top', 'tb_traffic', 'basys2', 'xc3s250e', 'vhdl', 'constraints/traffic.ucf']);
  assert.deepEqual(ex.project.files.map((f) => `${f.path}:${f.lang}:${f.role}`), [
    'src/traffic.vhd:vhdl:design', 'src/lamps.vhd:vhdl:design', 'src/timer.vhd:vhdl:design', 'src/sevenseg.v:verilog:design',
    'src/top.vhd:vhdl:design', 'sim/tb_traffic.vhd:vhdl:sim',
  ]);
  assert.deepEqual(fs.readdirSync(path.join(ex.dir, 'src')).sort(), ['lamps.bool.json', 'lamps.vhd', 'sevenseg.v', 'timer.vhd', 'top.vhd', 'traffic.fsm.json', 'traffic.vhd']);
  // the display is the clock example's (only its header comment differs: the example is complete by itself)
  const body = (t) => t.replace(/^(\/\/.*\n)+/, '');
  assert.equal(body(read('src/sevenseg.v')), body(fs.readFileSync(path.join(example('clock').dir, 'src/sevenseg.v'), 'utf8')));
});

test('traffic: the state diagram, linked to traffic.vhd, the HDL shipped is the one it generates (and reads back to it)', () => {
  assert.equal(fsm.generatedFile, 'src/traffic.vhd');
  assert.deepEqual(normalizeFsm(fsm), fsm, 'saved as the editor keeps it');
  // no error and no warning (only the notes that a state waits for its condition)
  assert.deepEqual(validateFsm(fsm).filter((d) => d.severity !== 'info'), []);
  assert.equal(fsmHdl, fsmCode(fsm));
  const back = fsmFromHdl(fsmHdl, { path: 'src/traffic.vhd', module: 'traffic', lang: 'vhdl', previous: fsm });
  assert.deepEqual(back.warnings, []);
  assert.ok(sameFsm(back.model, fsm), 'the VHDL reads back to the same diagram');
  assert.match(fsmHdl, /^-- Description : Moore finite state machine generated from the state diagram traffic\.fsm\.json$/m);
});

test('traffic: the state diagram is a Moore machine, binary encoding, its 7 states and transitions as designed', () => {
  assert.deepEqual([fsm.type, fsm.encoding, fsm.clock, fsm.reset], ['moore', 'binary', 'clk', { name: 'rst', active: 'high', sync: true }]);
  assert.deepEqual(fsm.inputs, [{ name: 'req', width: 1 }, { name: 'done', width: 1 }, { name: 'night', width: 1 }]);
  assert.deepEqual(fsm.outputs, [{ name: 'phase', width: 3, default: '0' }]);
  // the states, their codes (3 bits) and their phase output (the code again)
  const enc = fsmEncoding(fsm);
  assert.deepEqual(enc.map((e) => `${e.name}=${e.bits}`), PHASES.map((n, i) => `${n}=${i.toString(2).padStart(3, '0')}`));
  assert.deepEqual(fsm.states.map((s) => `${s.name}:${s.outputs.phase}`), PHASES.map((n, i) => `${n}:${i}`));
  assert.equal(fsm.states.find((s) => s.id === fsm.initial).name, 'CARS');
  const name = new Map(fsm.states.map((s) => [s.id, s.name]));
  assert.deepEqual(fsm.transitions.map((t) => `${name.get(t.from)} -[${t.cond}]-> ${name.get(t.to)}`), [
    'CARS -[night]-> NIGHT',
    'CARS -[!night && req && done]-> CARS_YELLOW',
    'CARS_YELLOW -[done]-> ALL_RED',
    'ALL_RED -[done]-> WALK',
    'WALK -[done]-> WALK_END',
    'WALK_END -[done]-> ALL_RED_2',
    'ALL_RED_2 -[done]-> CARS',
    'NIGHT -[!night]-> CARS',
  ]);
  // laid out readably: no two states overlap
  for (const a of fsm.states) for (const b of fsm.states) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 150, `${a.name} / ${b.name}`);
  // the timer and the top use the same phase codes
  for (const [f, names] of [['src/timer.vhd', PHASES.slice(0, 6)], ['src/top.vhd', ['WALK']]]) {
    for (const n of names) assert.match(read(f), new RegExp(`constant ${n} +: STD_LOGIC_VECTOR \\(2 downto 0\\) := "${PHASES.indexOf(n).toString(2).padStart(3, '0')}";`), `${f} ${n}`);
  }
});

test('traffic: the truth table, linked to lamps.vhd: its 5 lamp columns, the HDL shipped is the one it generates (and reads back to it)', () => {
  assert.equal(tt.generatedFile, 'src/lamps.vhd');
  assert.deepEqual(normalizeTable(tt), tt, 'saved as the tool keeps it');
  assert.deepEqual(validateTable(tt), []);
  assert.deepEqual(tt.inputs, ['phase2', 'phase1', 'phase0', 'blink']);
  assert.deepEqual(tt.outputs, ['car_r', 'car_y', 'car_g', 'walk_r', 'walk_g']);
  // rows: the phase code (phase2 the MSB) and blink; code 7 is never used (don't care)
  assert.deepEqual(tt.table, {
    car_r: '00001111111100XX',    // ALL_RED, WALK, WALK_END, ALL_RED_2
    car_y: '00110000000001XX',    // CARS_YELLOW; NIGHT when blink
    car_g: '11000000000000XX',    // CARS
    walk_r: '11111100001100XX',   // CARS, CARS_YELLOW, ALL_RED, ALL_RED_2
    walk_g: '00000011010000XX',   // WALK; WALK_END when blink
  });
  assert.equal(ttHdl, ttCode(tt));
  assert.match(ttHdl, /^ {4}car_r <= \(not phase2 and phase1\) or \(phase2 and not phase1\);$/m);   // (the don't cares used)
  const back = truthTableFromModule(ex.design.filter((s) => s.path === 'src/lamps.vhd'), 'lamps');
  const dcs = dontCaresInHdl(ttHdl);
  for (const o of back.outputs) for (const r of dcs[o] || []) back.table[o] = back.table[o].slice(0, r) + 'X' + back.table[o].slice(r + 1);
  assert.deepEqual([back.inputs, back.outputs, back.table], [tt.inputs, tt.outputs, tt.table]);
});

test('traffic: the board pins, on every board (BTN0, SW0 / SW1, LD7..LD0, the display, the clock)', () => {
  const ports = ['clk', 'sw<0>', 'sw<1>', 'btn<0>', 'dp', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `led<${i}>`), ...[0, 1, 2, 3, 4, 5, 6].map((i) => `seg<${i}>`), ...[0, 1, 2, 3].map((i) => `an<${i}>`)];
  for (const t of TARGETS) {
    const u = exampleUcf('traffic', t);
    assert.deepEqual(u.unmatched, [], `${targetName(t)}`);
    for (const p of ports) assert.match(u.text, new RegExp(`NET "${p}" +LOC = "\\w+" ;`), `${targetName(t)} ${p}`);
    // the board's clock: 50 MHz, the Spartan-6 boards' 100 MHz
    const period = ['nexys3', 'atlys'].includes(t.board) ? 10 : 20;
    assert.match(u.text, new RegExp(`TIMESPEC "TS_clk" = PERIOD "clk" ${period} ns HIGH 50% ;`), targetName(t));
  }
  const b = read('constraints/traffic.ucf');
  assert.equal(b, exampleUcf('traffic', { board: 'basys2', variant: '250' }).text);
  // the Basys2: BTN0 = G12, SW0 = P11, SW1 = L3, LD7 = G1, LD0 = M5
  for (const [p, loc] of [['btn<0>', 'G12'], ['sw<0>', 'P11'], ['sw<1>', 'L3'], ['led<7>', 'G1'], ['led<0>', 'M5']]) assert.match(b, new RegExp(`NET "${p}" +LOC = "${loc}" ;`));
});

test('traffic: the test bench passes; a wrong transition, lamp, phase length or request latch fails it', { timeout: 120000 }, async () => {
  const ok = await runTestbench('traffic');
  assert.ok(ok.passed, ok.log.join('\n'));
  assert.deepEqual(ok.log, ['Simulation finished OK']);
  assert.deepEqual(ok.warnings, []);
  const fails = async (edit, first) => {
    const r = await runTestbench('traffic', { edit });
    assert.equal(r.passed, false);
    assert.equal(r.log[0], first);
    assert.match(r.log.at(-1), /^ERROR: \d+ wrong value\(s\)$/);
    assert.ok(!r.log.includes('Simulation finished OK'));
  };
  // the state diagram: WALK straight to ALL_RED_2 (no WALK_END)
  let m = structuredClone(fsm);
  m.transitions.find((t) => t.from === 's4').to = 's6';
  await fails({ 'src/traffic.vhd': fsmCode(m) }, 'ERROR: first crossing, walk end, 3 s left: the lamps are 10000010, expected 10000001');
  // the state diagram: the cars' green ends without a request
  m = structuredClone(fsm);
  m.transitions.find((t) => t.to === 's2').cond = '!night && done';
  await fails({ 'src/traffic.vhd': fsmCode(m) }, 'ERROR: no request: the lamps are 01000010, expected 00100010');
  // the truth table: the pedestrians' green steady in WALK_END (row 8: phase 4, blink 0)
  let t = structuredClone(tt);
  t.table.walk_g = `${t.table.walk_g.slice(0, 8)}1${t.table.walk_g.slice(9)}`;
  await fails({ 'src/lamps.vhd': ttCode(t) }, 'ERROR: first crossing, walk end, 3 s left: the lamps are 10000001, expected 10000000');
  // the truth table: the cars' yellow steady at night (row 12: phase 6, blink 0)
  t = structuredClone(tt);
  t.table.car_y = `${t.table.car_y.slice(0, 12)}1${t.table.car_y.slice(13)}`;
  await fails({ 'src/lamps.vhd': ttCode(t) }, 'ERROR: night: the lamps are 01000000, expected 00000000');
  // the timer: a yellow of 3 s
  const timer = read('src/timer.vhd');
  assert.ok(timer.includes('YELLOW_S : integer := 2;'));
  await fails({ 'src/timer.vhd': timer.replace('YELLOW_S : integer := 2;', 'YELLOW_S : integer := 3;') }, 'ERROR: first crossing, all red: the lamps are 01000010, expected 10000010');
  // the top: the request never cleared (a second crossing after the first)
  const top = read('src/top.vhd');
  assert.ok(top.includes("if rst = '1' or phase = WALK then"));
  await fails({ 'src/top.vhd': top.replace("if rst = '1' or phase = WALK then", "if rst = '1' then") }, 'ERROR: after the crossing (the request cleared): the lamps are 01000010, expected 00100010');
  // the display: the seconds left one too many
  await fails({ 'src/timer.vhd': timer.replace('WALK_S + END_S - secs', 'WALK_S + END_S + 1 - secs') }, 'ERROR: first crossing, walk, 8 s left: the display (an 1110) shows 0010000, expected 0000000');   // 9, not 8
});
