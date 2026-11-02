import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateUcf, parseUcf, expandPort, normalizePort, periodNs, bitName, ucfPortName, boardAutoAssign, pinsUcf, backAnnotateUcf, ucfPlacesPins } from '../packages/silinx-fpga/src/ucf.js';

test('bus naming: led[7:0] bit 3 -> led<3>', () => {
  assert.equal(bitName('led', 3), 'led<3>');
  assert.equal(bitName('clk'), 'clk');
  assert.deepEqual(expandPort('led[3:0]'), ['led<0>', 'led<1>', 'led<2>', 'led<3>']);
  assert.deepEqual(expandPort({ name: 'd', width: 2 }), ['d<0>', 'd<1>']);
  assert.deepEqual(expandPort('clk'), ['clk']);
  assert.deepEqual(normalizePort('x[0:3]'), { name: 'x', msb: 0, lsb: 3, width: 4, bus: true });
  assert.deepEqual(expandPort('x[0:3]'), ['x<3>', 'x<2>', 'x<1>', 'x<0>']);
});

test('periodNs units', () => {
  assert.equal(periodNs(20), 20);
  assert.equal(periodNs('20 ns'), 20);
  assert.equal(periodNs('50 MHz'), 20);
  assert.equal(periodNs('1 us'), 1000);
});

test('generateUcf emits LOC/IOSTANDARD/pull/drive/slew and timing', () => {
  const ucf = generateUcf({
    ports: ['clk', 'led[1:0]', 'btn'],
    assignments: {
      clk: { loc: 'c9', iostandard: 'LVCMOS33' },
      'led<0>': { loc: 'F12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
      'led<1>': { loc: 'E12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
      sw: { loc: 'L13', pull: 'up' },
    },
    clocks: [{ net: 'clk', period: '50 MHz' }],
  });
  assert.match(ucf, /NET "clk"\s+LOC = "C9" \| IOSTANDARD = LVCMOS33 ;/);
  assert.match(ucf, /NET "led<0>"\s+LOC = "F12" \| IOSTANDARD = LVTTL \| DRIVE = 8 \| SLEW = SLOW ;/);
  assert.match(ucf, /# NET "btn"\s+LOC = "" ;\s+# unassigned/);
  assert.match(ucf, /NET "sw"\s+LOC = "L13" \| PULLUP ;\s+# not a port/);
  assert.match(ucf, /NET "clk" TNM_NET = "clk" ;/);
  assert.match(ucf, /TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;/);
});

test('generateUcf CLOCK_DEDICATED_ROUTE and pulldown', () => {
  const ucf = generateUcf({ assignments: { mclk: { loc: 'B8', clockDedicatedRoute: false }, b: { loc: 'H13', pull: 'down' } } });
  assert.match(ucf, /NET "mclk"\s+CLOCK_DEDICATED_ROUTE = FALSE ;/);
  assert.match(ucf, /NET "b"\s+LOC = "H13" \| PULLDOWN ;/);
});

test('parseUcf round trip', () => {
  const assignments = {
    clk: { loc: 'C9', iostandard: 'LVCMOS33' },
    'led<0>': { loc: 'F12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
    'sw<0>': { loc: 'L13', iostandard: 'LVTTL', pull: 'up' },
    btn: { loc: 'H13', pull: 'down' },
  };
  const text = generateUcf({ assignments, clocks: [{ net: 'clk', period: 20 }] });
  const r = parseUcf(text);
  assert.deepEqual(r.assignments, assignments);
  assert.deepEqual(r.clocks, [{ net: 'clk', name: 'TS_clk', tnm: 'clk', period: 20, duty: 50 }]);
  assert.deepEqual(r.other, []);
});

test('parseUcf handles vendor style files, comments, multi-line, inline PERIOD', () => {
  const r = parseUcf(`
# Spartan-3E starter kit
NET "CLK_50MHZ" LOC = "C9"  | IOSTANDARD = LVCMOS33 ;
NET "CLK_50MHZ" PERIOD = 20.0ns HIGH 40%;
NET "LED<0>" LOC = "F12" | IOSTANDARD = LVTTL | SLEW = SLOW
   | DRIVE = 8 ; # trailing comment
NET ROT_A LOC = K18 | IOSTANDARD = LVTTL | PULLUP;
NET "mclk" CLOCK_DEDICATED_ROUTE = FALSE;
INST "u0" LOC = "SLICE_X0Y0";
NET "x" TNM_NET = "grp_x";
TIMESPEC "TS_x" = PERIOD "grp_x" 10 ns LOW 30 %;
`);
  assert.deepEqual(r.assignments['CLK_50MHZ'], { loc: 'C9', iostandard: 'LVCMOS33' });
  assert.deepEqual(r.assignments['LED<0>'], { loc: 'F12', iostandard: 'LVTTL', slew: 'slow', drive: 8 });
  assert.deepEqual(r.assignments.ROT_A, { loc: 'K18', iostandard: 'LVTTL', pull: 'up' });
  assert.equal(r.assignments.mclk.clockDedicatedRoute, false);
  assert.deepEqual(r.clocks[0], { net: 'CLK_50MHZ', period: 20, duty: 40 });
  assert.deepEqual(r.clocks[1], { net: 'x', name: 'TS_x', tnm: 'grp_x', period: 10, duty: 70 });
  assert.equal(r.other.length, 1);
  assert.match(r.other[0], /^INST "u0"/);
});

test('boardAutoAssign maps blinky ports to the Basys2 and locsNotOnBoard flags foreign pins', async () => {
  const { boardAutoAssign, locsNotOnBoard, generateUcf, parseUcf } = await import('../packages/silinx-fpga/src/ucf.js');
  const { resolveBoard } = await import('../server/devices.js');
  const rb = resolveBoard('basys2');
  const board = { ...rb.board, device: rb.device, resources: rb.resources };
  const ports = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }, { name: 'foo', dir: 'out', width: 1 }];
  const r = boardAutoAssign(ports, board);
  assert.equal(r.assignments.clk.loc, 'B8');
  assert.equal(r.assignments['sw<3>'].loc, 'B4');
  assert.equal(r.assignments['led<7>'].loc, 'G1');
  assert.deepEqual(r.unmatched, ['foo']);
  // the I/O standard is left at the default: no IOSTANDARD written
  assert.ok(Object.values(r.assignments).every(a => a.iostandard === undefined));
  assert.doesNotMatch(generateUcf({ ports, assignments: r.assignments, clocks: r.clocks }), /IOSTANDARD/);
  const ucf = parseUcf(generateUcf({ ports, assignments: r.assignments, clocks: r.clocks }));
  assert.deepEqual(locsNotOnBoard(ucf.assignments, board), []);
  assert.deepEqual(locsNotOnBoard({ 'led<1>': { loc: 'E12' } }, board), [{ net: 'led<1>', loc: 'E12' }]);
  // byDirection: the ports no name matches take the free switches / buttons (inputs) and LEDs (outputs)
  const sw = rb.resources.find(x => x.name === 'sw').pins, btn = rb.resources.find(x => x.name === 'btn').pins, led = rb.resources.find(x => x.name === 'led').pins;
  const gate = boardAutoAssign([{ name: 'a', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }], board, { byDirection: true });
  assert.deepEqual([gate.assignments.a.loc, gate.assignments.b.loc, gate.assignments.y.loc], [sw[0], sw[1], led[0]]);
  assert.deepEqual(gate.byDirection, [{ port: 'a', nets: [['a', 'sw<0>']] }, { port: 'b', nets: [['b', 'sw<1>']] }, { port: 'y', nets: [['y', 'led<0>']] }]);
  assert.deepEqual(gate.unmatched, []);
  // the pins taken by name are skipped; a bus fills bit by bit, past the switches onto the buttons; too wide: the rest unassigned
  const mix = boardAutoAssign([{ name: 'sw', dir: 'in', width: 2, msb: 1, lsb: 0 }, { name: 'd', dir: 'in', width: 8, msb: 7, lsb: 0 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 },
    { name: 'q', dir: 'out', width: 1 }, { name: 'io', dir: 'inout', width: 1 }], board, { byDirection: true });
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => mix.assignments[`d<${i}>`].loc), [...sw.slice(2), ...btn.slice(0, 2)]);
  assert.deepEqual(mix.unmatched, ['q', 'io'], 'no LED left for q; an inout is never guessed');
  // without the option: as before
  assert.deepEqual(boardAutoAssign([{ name: 'a', dir: 'in', width: 1 }], board).unmatched, ['a']);
});

// ---- checkUcf
import { checkUcf } from '../packages/silinx-fpga/src/ucf.js';
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 }];
const chk = (t, o = {}) => checkUcf(t, { top: 'top', ports: PORTS, iostandards: ['LVCMOS33', 'LVTTL'], package: 'cp132', ...o });

test('checkUcf: a correct file has no diagnostics', () => {
  const t = 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33;\n' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `NET "led<${i}>" LOC = M${i + 1} | DRIVE = 8 | SLEW = SLOW;`).join('\n') +
    '\n' + [0, 1, 2, 3].map(i => `NET "sw<${i}>" LOC = P${i + 1};`).join('\n') + '\nNET "clk" TNM_NET = "clk";\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;\n';
  assert.deepEqual(chk(t), []);
});

test('checkUcf: unknown nets, bus bits, duplicate pins, values and syntax are reported on their line', () => {
  const t = 'NET "led<9>" LOC = M1;\nNET "foo" LOC = A1;\nNET "sw" LOC = C3;\nNET "clk" LOC = M1 | DRIVE = 7;\nNET "led<1>" IOSTANDARD = LVDS_99;\nTIMESPEC TS = PERIOD "nope" 20 ns;\nLOC x;\nNET "clk<0>" PULLUP;\nNET "led<2>" LOC = M3';
  const d = chk(t);
  assert.deepEqual(d.map(x => [x.line, x.severity, x.message]), [
    [1, 'error', "bit 9 is out of range for 'led' (7 downto 0)"],
    [2, 'error', 'NET "foo" does not exist in the top module \'top\' (no port named \'foo\')'],
    [3, 'error', "'sw' is a 4-bit bus: constrain each bit (NET \"sw<0>\" …)"],
    [4, 'error', 'pin M1 is already assigned to NET "led<9>" (line 1)'],
    [4, 'error', "invalid DRIVE '7' (2, 4, 6, 8, 12, 16 or 24 mA)"],
    [5, 'error', "IOSTANDARD 'LVDS_99' is not supported by this device family"],
    [6, 'error', 'TIMESPEC refers to the timing group "nope", which no TNM_NET/TNM/TIMEGRP defines'],
    [7, 'error', "syntax error: 'LOC' is not a UCF statement (NET, INST, TIMESPEC, TIMEGRP, CONFIG…)"],
    [8, 'error', '\'clk\' is a single bit, not a bus: use NET "clk"'],
    [9, 'warning', "11 port bit(s) of 'top' have no LOC: led<0>, led<1>, led<3>, led<4>, led<5>, led<6>, led<7>, sw<0>, sw<1>, sw<2>, …"],
    [9, 'error', 'missing \';\' at the end of the constraint "NET "led<2>" LOC = M3"'],
  ]);
});

// #34: XST's names of escaped Verilog identifiers, measured with ISE 14.7 (the netlist's port names
// and the UCF names ngdbuild finds)
test('ucfPortName / bitName: XST\'s netlist names of escaped ports (measured with ISE)', () => {
  const xst = {
    'opcode[0]': '_opcode[0]_', 'res[0]': '_res[0]_', '1abc': '_1abc_', 'a[1:0]': '_a[1:0]_', 'm(2)': '_m(2)_', 'n<4>': '_n<4>_', 'A[0]': '_A[0]_',
    'a+b': '_a_b_', 'foo.bar': '_foo_bar_', 'x/y': '_x_y_', 'p~z': '_p_z_', 'p^z': '_p_z_', 'p*z': '_p_z_', 'p=z': '_p_z_', 'p%z': '_p_z_', 'p&z': '_p_z_', 'p\\z': '_p_z_', 'w[0]$x': '_w[0]_x_', '9$': '_9__',
    'p-z': '_p-z_', 'p{z': '_p{z_', 'p}z': '_p}z_', 'p:z': '_p:z_', 'p;z': '_p;z_', 'p#z': '_p#z_', 'p|z': '_p|z_', 'p@z': '_p@z_', 'p?z': '_p?z_', 'p!z': '_p!z_', "p'z": "_p'z_", 'p`z': '_p`z_', 'p,z': '_p,z_',
    plain: 'plain', _q_: '_q_', 'b$c': 'b_c', 'q$': 'q_', clk: 'clk',
  };
  for (const [hdl, net] of Object.entries(xst)) assert.equal(ucfPortName(hdl), net, hdl);
  assert.equal(bitName('opcode[0]'), '_opcode[0]_');
  assert.equal(bitName('v.x', 1), '_v_x_<1>');
  assert.deepEqual(expandPort({ name: 'v.x', msb: 1, lsb: 0 }), ['_v_x_<0>', '_v_x_<1>']);
  assert.deepEqual(expandPort({ name: 'opcode[0]' }), ['_opcode[0]_']);
  // a UCF written for such ports, and the board's automatic pins
  const ports = [{ name: 'opcode[0]', dir: 'in' }, { name: 'v.x', dir: 'in', msb: 1, lsb: 0 }];
  assert.match(generateUcf({ ports, assignments: { '_opcode[0]_': { loc: 'A1' }, '_v_x_<1>': { loc: 'B2' } } }),
    /^NET "_opcode\[0\]_" LOC = "A1" ;\n# NET "_v_x_<0>" +LOC = "" ; {2}# unassigned\nNET "_v_x_<1>" +LOC = "B2" ;$/m);
  const board = { name: 'B', resources: [{ name: 'clk$', group: 'Clock', pins: ['B8'], extra: { period: '20 ns' } }] };
  const auto = boardAutoAssign([{ name: 'clk$', width: 1 }], board);
  assert.deepEqual(auto.assignments, { clk_: { loc: 'B8' } });
  assert.deepEqual(auto.clocks, [{ net: 'clk_', period: 20, duty: 50 }]);
});

test('checkUcf: escaped ports by XST\'s names are accepted; by their HDL names, an error as in ngdbuild (#34)', () => {
  const ports = [{ name: 'opcode[0]', dir: 'in' }, { name: 'opcode[1]', dir: 'in' }, { name: 'v.x', dir: 'in', msb: 1, lsb: 0 }, { name: 'b$c', dir: 'in' }, { name: 'clk', dir: 'in' }];
  const c = t => checkUcf(t, { top: 'top', ports, lang: 'verilog', package: 'cp132' }).map(d => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
  assert.deepEqual(c('NET "_opcode[0]_" LOC = "A1" ;\nNET "_opcode[1]_" LOC = "A2" ;\nNET "_v_x_<0>" LOC = "A3" ;\nNET "_v_x_<1>" LOC = "B3" ;\nNET "b_c" LOC = "B1";\nNET "clk" LOC = "C8";\n'), []);
  assert.deepEqual(c('NET "opcode[0]" LOC = "A1" ;\nNET "\\opcode[1]" LOC = "A2" ;\nNET "v.x<0>" LOC = "A3" ;\nNET "_v_x_" LOC = "B3" ;\nNET "b$c" LOC = "B1";\nNET "_OPCODE[1]_" LOC = "B2";\n'), [
    '1:6 error: NET "opcode[0]" is not found by ISE: XST names the port \'opcode[0]\' _opcode[0]_ in its netlist (use NET "_opcode[0]_")',
    '2:6 error: NET "\\opcode[1]" is not found by ISE: XST names the port \'opcode[1]\' _opcode[1]_ in its netlist (use NET "_opcode[1]_")',
    '3:6 error: NET "v.x<0>" is not found by ISE: XST names the port \'v.x\' _v_x_ in its netlist (use NET "_v_x_<0>")',
    '4:6 error: \'_v_x_\' is a 2-bit bus: constrain each bit (NET "_v_x_<0>" …)',
    '5:6 error: NET "b$c" is not found by ISE: XST names the port \'b$c\' b_c in its netlist (use NET "b_c")',
    '6:1 warning: 5 port bit(s) of \'top\' have no LOC: _opcode[0]_, _v_x_<0>, _v_x_<1>, b_c, clk',
    '6:6 warning: NET "_OPCODE[1]_": the port is called \'_opcode[1]_\' (ISE matches it ignoring the case; Verilog names are case-sensitive)',
  ]);
});

test('checkUcf: timing constraints on internal nets are warnings; QFP pins and board pins are checked', () => {
  const sm = ds => ds.map(d => [d.severity, d.message]);
  assert.deepEqual(sm(chk('NET "cnt_en" TNM_NET = "x";\nTIMEGRP "x" = FFS;')), [
    ['warning', 'NET "cnt_en" does not exist in the top module \'top\' as a port (timing constraints on internal nets are resolved after synthesis)'],
  ]);
  assert.deepEqual(sm(chk('NET "clk" LOC = P200;', { package: 'vq100' })), [
    ['warning', "12 port bit(s) of 'top' have no LOC: led<0>, led<1>, led<2>, led<3>, led<4>, led<5>, led<6>, led<7>, sw<0>, sw<1>, …"],
    ['error', "'P200' is not a pin of the vq100 package (P1…P100)"],
  ]);
  const board = { name: 'B', resources: [{ name: 'clk', pins: ['B8'] }] };
  assert.deepEqual(sm(checkUcf('NET "clk" LOC = C9;', { top: 'top', ports: [PORTS[0]], board })), [['warning', 'pin C9 is not connected to any resource of the B']]);
});

test('parseUcf: bus bits written as a(0) or a[0] map to a<0>', () => {
  const a = parseUcf('NET "sw(0)" LOC = "P11";\nNET sw[1] LOC = L3;\nNET "led<2>" LOC = "P7";').assignments;
  assert.equal(a['sw<0>'].loc, 'P11');
  assert.equal(a['sw<1>'].loc, 'L3');
  assert.equal(a['led<2>'].loc, 'P7');
});

// #63, measured with ISE 14.7 (Verilog top: input [1:0] x, input \opcode[1] ): ngdbuild finds
// NET "x[1]", "x(1)" and "x<1>" (the same net), and "_opcode[1]_", but not "opcode[1]"
// (ConstraintSystem:59)
test('parseUcf with the ports: bus bits written x[1] / x(1) are x<1>, any other bracket name is kept as written (#63)', () => {
  const ports = [{ name: 'x', dir: 'in', msb: 1, lsb: 0 }, { name: 'opcode[1]', dir: 'in' }, { name: 'v.x', dir: 'in', msb: 1, lsb: 0 }, { name: 'clk', dir: 'in' }, { name: 'd', dir: 'in', msb: 0, lsb: 0, bus: true }];
  const src = 'NET "x[1]" LOC = "P11";\nNET "x(0)" LOC = "L3";\nNET "opcode[1]" LOC = "K3";\nNET "_opcode[1]_" IOSTANDARD = LVCMOS33;\n'
    + 'NET "_v_x_[1]" LOC = "B4";\nNET "clk[0]" LOC = "B8";\nNET "d[0]" LOC = "G3";\nNET "y[2]" LOC = "F3";\nNET "X[0]" PULLUP;\n';
  const u = parseUcf(src, { ports });
  assert.deepEqual(u.assignments, {
    'x<1>': { loc: 'P11' }, 'x<0>': { loc: 'L3' }, 'opcode[1]': { loc: 'K3' }, '_opcode[1]_': { iostandard: 'LVCMOS33' },
    '_v_x_<1>': { loc: 'B4' }, 'clk[0]': { loc: 'B8' }, 'd<0>': { loc: 'G3' }, 'y[2]': { loc: 'F3' }, 'X<0>': { pull: 'up' },
  });
  assert.deepEqual(u.other, []);
  // a TNM_NET / PERIOD on such a name keeps it too
  const t = parseUcf('NET "opcode[1]" TNM_NET = "g";\nTIMESPEC "TS_g" = PERIOD "g" 10 ns;\nNET "x[1]" PERIOD = 20 ns;', { ports });
  assert.deepEqual(t.clocks, [{ net: 'x<1>', period: 20, duty: 50 }, { net: 'opcode[1]', name: 'TS_g', tnm: 'g', period: 10, duty: 50 }]);
  // without the ports, every name of that shape is a bus bit (the netlist consumers: pack, emulator)
  assert.deepEqual(Object.keys(parseUcf(src).assignments), ['x<1>', 'x<0>', 'opcode<1>', '_opcode[1]_', '_v_x_<1>', 'clk<0>', 'd<0>', 'y<2>', 'X<0>']);
  // the pin planner's round trip: the ports' bits under their names, the hand-written name as written
  const text = generateUcf({ ports, assignments: u.assignments });
  assert.match(text, /^NET "opcode\[1\]" +LOC = "K3" ; {2}# not a port of the top module$/m);
  assert.match(text, /^NET "x<1>" +LOC = "P11" ;$/m);
  assert.doesNotMatch(text, /opcode<1>/);
  // and Check Constraints says what ngdbuild says about each
  const c = s => checkUcf(s, { top: 't', ports: ports.slice(0, 2), lang: 'verilog', package: 'cp132' }).map(d => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
  assert.deepEqual(c('NET "x[1]" LOC = "P11";\nNET "x(0)" LOC = "L3";\nNET "_opcode[1]_" LOC = "K3";\n'), [
    '1:7 warning: use x<1> for a bus bit in UCF (the default bus delimiter is <>)',
    '2:7 warning: use x<0> for a bus bit in UCF (the default bus delimiter is <>)',
  ]);
  assert.deepEqual(c('NET "x<1>" LOC = "P11";\nNET "x<0>" LOC = "L3";\nNET "opcode[1]" LOC = "K3";\n'), [
    '3:1 warning: 1 port bit(s) of \'t\' have no LOC: _opcode[1]_',
    '3:6 error: NET "opcode[1]" is not found by ISE: XST names the port \'opcode[1]\' _opcode[1]_ in its netlist (use NET "_opcode[1]_")',
  ]);
});

test('parseUcf -> generateUcf keeps INST/OFFSET/TIMEGRP, derived TIMESPECs and their TNM_NETs', () => {
  const src = `NET "clk" LOC = "C9" | IOSTANDARD = LVCMOS33;
NET "clk" TNM_NET = "clk";
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;
NET "clk2" TNM_NET = "clk2";
TIMESPEC "TS_clk2" = PERIOD "clk2" TS_clk / 2;
TIMESPEC "TS_clk4" = PERIOD "clk4" "TS_clk" * 4 PHASE 1 ns;
INST "u_ram" LOC = RAMB16_X0Y0;
NET "din<*>" OFFSET = IN 5 ns BEFORE "clk";
TIMEGRP "fast" = FFS(u_core/*);
NET "a" LOC = "P11" | IOB = TRUE;
`;
  const u = parseUcf(src);
  assert.deepEqual(u.clocks, [{ net: 'clk', name: 'TS_clk', tnm: 'clk', period: 20, duty: 50 }]);   // not 2 ns, not 4 ns
  assert.deepEqual(u.other, [
    'NET "clk2" TNM_NET = "clk2"',
    'TIMESPEC "TS_clk2" = PERIOD "clk2" TS_clk / 2',
    'TIMESPEC "TS_clk4" = PERIOD "clk4" "TS_clk" * 4 PHASE 1 ns',
    'INST "u_ram" LOC = RAMB16_X0Y0',
    'NET "din<*>" OFFSET = IN 5 ns BEFORE "clk"',
    'TIMEGRP "fast" = FFS(u_core/*)',
    'NET "a" IOB = TRUE',
  ]);
  const out = generateUcf({ assignments: u.assignments, clocks: u.clocks, other: u.other });
  for (const o of u.other) assert.ok(out.includes(`${o} ;`), o);
  const again = parseUcf(out);
  assert.deepEqual(again.assignments, u.assignments);
  assert.deepEqual(again.clocks, u.clocks);
  assert.deepEqual(again.other, u.other);
  assert.deepEqual(checkUcf(out).filter(d => d.severity === 'error' && !/clk4/.test(d.message)), []);
});

test('parseUcf does not throw on attributes without a value (kept verbatim)', () => {
  const u = parseUcf('NET "a" LOC;\nNET "b" SLEW;\nNET "c" IOSTANDARD | LOC = P3;\nNET "d" DRIVE = x;\nNET "e" LOC = "";');
  assert.deepEqual(u.assignments, { c: { loc: 'P3' } });
  assert.deepEqual(u.other, ['NET "a" LOC', 'NET "b" SLEW', 'NET "c" IOSTANDARD', 'NET "d" DRIVE = x', 'NET "e" LOC = ""']);
  assert.deepEqual(checkUcf('NET "a" LOC;').map(d => [d.severity, d.message]), [['error', 'LOC needs a value (LOC = …)']]);
});

// #65, measured with ISE 14.7 (VHDL top: \Mixed\, \lower\, \a.b\ : std_logic; \Bus\ :
// std_logic_vector(1 downto 0)): ngdbuild finds _Mixed_, _lower_, _a_b_, _Bus_<1> (and _mixed_: the
// UCF of a VHDL design is case-insensitive), not Mixed, lower or Bus<1> (ConstraintSystem:59)
test('VHDL extended identifiers: case kept, names of their own, XST\'s _Mixed_ in the UCF (measured with ISE) (#65)', async () => {
  for (const [hdl, net] of [['\\Mixed\\', '_Mixed_'], ['\\lower\\', '_lower_'], ['\\a.b\\', '_a_b_'], ['\\x y\\', '_x y_'], ['\\a\\\\b\\', '_a_b_'], ['\\1st\\', '_1st_']]) assert.equal(ucfPortName(hdl), net, hdl);
  assert.equal(bitName('\\Bus\\', 1), '_Bus_<1>');
  // the elaborated ports: \Mixed\, \mixed\ and mixed are three ports (extended identifiers are
  // case-sensitive and never a basic identifier); a reference in another case is the basic one
  const { compile, elaborate } = await import('../core/compile.js');
  const V = `library ieee; use ieee.std_logic_1164.all;
entity t is port (\\Mixed\\, \\mixed\\, mixed, \\a.b\\ : in std_logic; \\Bus\\ : in std_logic_vector(1 downto 0); y : out std_logic_vector(2 downto 0)); end t;
architecture rtl of t is begin
  y(0) <= \\Mixed\\ and not \\mixed\\;
  y(1) <= MIXED xor \\a.b\\;
  y(2) <= \\Bus\\(0) xor \\Bus\\(1);
end rtl;
`;
  const lib = compile([{ path: 't.vhd', lang: 'vhdl', text: V }]);
  const d = elaborate(lib, 't');
  assert.deepEqual([...lib.errors, ...d.diags], []);
  assert.deepEqual(d.top.ports.map(p => p.name), ['\\Mixed\\', '\\mixed\\', 'mixed', '\\a.b\\', '\\Bus\\', 'y']);
  assert.deepEqual(d.top.ports.flatMap(p => (p.sig.t.w > 1 ? [bitName(p.name, 0), bitName(p.name, 1)] : [bitName(p.name)])).slice(0, 7),
    ['_Mixed_', '_mixed_', 'mixed', '_a_b_', '_Bus_<0>', '_Bus_<1>', 'y<0>']);
  // the same \Mixed\ twice is one name; an undeclared spelling is an error naming it as written
  const bad = compile([{ path: 'b.vhd', lang: 'vhdl', text: 'library ieee; use ieee.std_logic_1164.all;\nentity b is port (\\Mixed\\ : in std_logic; y : out std_logic); end b;\narchitecture rtl of b is begin\n  y <= \\MIXED\\;\nend rtl;\n' }]);
  const bd = elaborate(bad, 'b');
  assert.deepEqual([...bad.errors, ...bd.diags].map(x => `${x.line}: ${x.message}`), ["4: '\\MIXED\\' is not declared"]);
  // Check Constraints: XST's names accepted; the HDL names are ngdbuild's error, with the right name
  const ports = [{ name: '\\Mixed\\', dir: 'in' }, { name: '\\lower\\', dir: 'in' }, { name: '\\a.b\\', dir: 'in' }, { name: '\\Bus\\', dir: 'in', msb: 1, lsb: 0 }, { name: 'y', dir: 'out' }];
  const c = s => checkUcf(s, { top: 't', ports, lang: 'vhdl', package: 'cp132' }).map(x => `${x.line}:${x.col} ${x.severity}: ${x.message}`);
  assert.deepEqual(c('NET "_Mixed_" LOC = "P11";\nNET "_LOWER_" LOC = "L3";\nNET "_a_b_" LOC = "K3";\nNET "_Bus_<0>" LOC = "B4";\nNET "_Bus_<1>" LOC = "G3";\nNET "y" LOC = "M5";\n'), []);
  assert.deepEqual(c('NET "Mixed" LOC = "P11";\nNET "lower" LOC = "L3";\nNET "\\a.b\\" LOC = "K3";\nNET "Bus<0>" LOC = "B4";\nNET "\\Bus\\(1)" LOC = "G3";\nNET "y" LOC = "M5";\n'), [
    '1:6 error: NET "Mixed" is not found by ISE: XST names the port \'\\Mixed\\\' _Mixed_ in its netlist (use NET "_Mixed_")',
    '2:6 error: NET "lower" is not found by ISE: XST names the port \'\\lower\\\' _lower_ in its netlist (use NET "_lower_")',
    '3:6 error: NET "\\a.b\\" is not found by ISE: XST names the port \'\\a.b\\\' _a_b_ in its netlist (use NET "_a_b_")',
    '4:6 error: NET "Bus<0>" is not found by ISE: XST names the port \'\\Bus\\\' _Bus_ in its netlist (use NET "_Bus_<0>")',
    '5:6 error: NET "\\Bus\\(1)" is not found by ISE: XST names the port \'\\Bus\\\' _Bus_ in its netlist (use NET "_Bus_<1>")',
    '6:1 warning: 5 port bit(s) of \'t\' have no LOC: _Mixed_, _lower_, _a_b_, _Bus_<0>, _Bus_<1>',
  ]);
});

test('VHDL extended identifiers through the open synthesis: the netlist\'s pads are XST\'s names (#65)', { timeout: 120000 }, async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const { readYosysJson } = await import('../packages/silinx-fpga/src/fpga/netlist.js');
  const V = `library ieee; use ieee.std_logic_1164.all;
entity t is port (\\Mixed\\, \\a.b\\ : in std_logic; \\Bus\\ : in std_logic_vector(1 downto 0); y : out std_logic_vector(1 downto 0)); end t;
architecture rtl of t is begin
  y(0) <= \\Mixed\\ xor \\a.b\\;
  y(1) <= \\Bus\\(0) xor \\Bus\\(1);
end rtl;
`;
  const r = await synthesizeOpen(elaborate(compile([{ path: 't.vhd', lang: 'vhdl', text: V }]), 't'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  // Yosys keeps the escape of these names in its JSON (\\Mixed\): the port is \Mixed\
  assert.deepEqual(Object.keys(JSON.parse(r.files['t.json']).modules.t.ports), ['\\\\Mixed\\', '\\\\a.b\\', '\\\\Bus\\', 'y']);
  const nl = readYosysJson(r.files['t.json']);
  assert.deepEqual(nl.ports.map(p => [p.name, p.bits.map(b => b.name)]), [
    ['\\Mixed\\', ['_Mixed_']], ['\\a.b\\', ['_a_b_']], ['\\Bus\\', ['_Bus_<0>', '_Bus_<1>']], ['y', ['y<0>', 'y<1>']],
  ]);
  // so is a Verilog escaped name that starts with a digit (\1abc  is \1abc in the JSON): XST's _1abc_
  const v = await synthesizeOpen(elaborate(compile([{ path: 'm.v', lang: 'verilog', text: 'module m(input \\1abc , input \\opcode[0] , output y);\n  assign y = \\1abc ^ \\opcode[0] ;\nendmodule\n' }]), 'm'), { run: yosysNode });
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(readYosysJson(v.files['m.json']).ports.map(p => p.bits.map(b => b.name).join()), ['_1abc_', '_opcode[0]_', 'y']);
});

test('checkUcf positions are right after comments with emoji (astral characters)', () => {
  const d = checkUcf('# pins \u{1F389}\u{1F389} for the board\nNET "a" LOC = A1 | DRIVE = 7;\n');
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].line, d[0].col], [2, 28]);
  assert.match(d[0].message, /invalid DRIVE/);
});

// measured with ISE 14.7 (#85): for a Verilog design ngdbuild takes a UCF name as written first
// (ports a and A get their own LOCs), else the one port that matches ignoring case (CLK -> clk)
test('checkUcf: Verilog ports that differ only in case (a / A) are kept apart; another case matches the only port so named, with a warning (#85)', () => {
  const ports = [{ name: 'a', dir: 'in' }, { name: 'A', dir: 'in' }, { name: 'clk', dir: 'in' }, { name: 'y', dir: 'out' }, { name: 'Y', dir: 'out' }];
  const diag = text => checkUcf(text, { top: 'top', ports, lang: 'verilog' }).map(d => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
  // each port by its own name: no message
  assert.deepEqual(diag('NET "a" LOC = "P11" ;\nNET "A" LOC = "L3" ;\nNET "clk" LOC = "B8" ;\nNET "y" LOC = "M5" ;\nNET "Y" LOC = "M11" ;\n'), []);
  // a and A on the same pin: two nets, a conflict
  assert.deepEqual(diag('NET "a" LOC = "P11" ;\nNET "A" LOC = "P11" ;\nNET "clk" LOC = "B8" ;\nNET "y" LOC = "M5" ;\nNET "Y" LOC = "M11" ;\n'),
    ['2:16 error: pin P11 is already assigned to NET "a" (line 1)']);
  // CLK: the only port named so ignoring case (ngdbuild takes it); A without LOC is reported missing
  assert.deepEqual(diag('NET "a" LOC = "P11" ;\nNET "CLK" LOC = "B8" ;\nNET "y" LOC = "M5" ;\nNET "Y" LOC = "M11" ;\n'), [
    '2:6 warning: NET "CLK": the port is called \'clk\' (ISE matches it ignoring the case; Verilog names are case-sensitive)',
    "4:1 warning: 1 port bit(s) of 'top' have no LOC: A",
  ]);
  // neither as written nor unique ignoring case
  assert.deepEqual(diag('NET "a" LOC = "P11" ;\nNET "A" LOC = "L3" ;\nNET "clk" LOC = "B8" ;\nNET "Y" LOC = "M11" ;\nNET "y" LOC = "M5" ;\nNET "y" IOSTANDARD = LVCMOS33 ;\n').filter(l => /matches/.test(l)), []);
  assert.deepEqual(checkUcf('NET "Ya" LOC = "M5" ;\n', { top: 'top', ports: [{ name: 'ya', dir: 'out' }, { name: 'YA', dir: 'out' }], lang: 'verilog' }).map(d => d.message),
    ["2 port bit(s) of 'top' have no LOC: ya, YA", 'NET "Ya" matches no port as written and several ignoring case (ya, YA): write the one you mean']);
});

// ---- Back-annotate Pin Locations (#118): the pins of a placement written as UCF, added to the user's
test('pinsUcf: the pins of a placement as pin2ucf writes them: one LOC per port bit, buses as x<i>, sorted', () => {
  const text = pinsUcf([{ net: 'led<10>', loc: 'P4' }, { net: 'clk', loc: 'B8' }, { net: 'led<2>', loc: 'P7' }, { net: '_opcode[0]_', loc: 'M5' }],
    { header: "Pin locations of 'top'" });
  assert.equal(text, `# Pin locations of 'top'

NET "_opcode[0]_" LOC = "M5" ;
NET "clk"         LOC = "B8" ;
NET "led<2>"      LOC = "P7" ;
NET "led<10>"     LOC = "P4" ;
`);
  // read back as any UCF
  assert.deepEqual(parseUcf(text).assignments, { '_opcode[0]_': { loc: 'M5' }, clk: { loc: 'B8' }, 'led<2>': { loc: 'P7' }, 'led<10>': { loc: 'P4' } });
  assert.equal(pinsUcf([]), '# Pin locations chosen by the placer (Silinx toolchain)\n\n');
});

test('backAnnotateUcf: the ports without a LOC get the placer\'s pins; the user\'s constraints are kept as written', () => {
  const ucf = `# my constraints
NET "clk"    LOC = "B8" | IOSTANDARD = LVCMOS33 ;
NET "led<0>" LOC = "M5" | IOSTANDARD = LVCMOS33 ;
NET "led<1>" IOSTANDARD = LVCMOS33 ;
NET "_opcode[0]_" LOC = "P11" ;
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
`;
  // the placement: the user's pins where they were, and the others where the placer put them
  const pins = pinsUcf([{ net: 'clk', loc: 'B8' }, { net: 'led<0>', loc: 'M5' }, { net: 'led<1>', loc: 'H12' }, { net: 'led<2>', loc: 'H13' },
    { net: 'sw', loc: 'J14' }, { net: '_opcode[0]_', loc: 'P11' }, { net: '_opcode[1]_', loc: 'K3' }]);
  const ports = [{ name: 'clk' }, { name: 'led', width: 3, msb: 2, lsb: 0 }, { name: 'sw' }, { name: '\\opcode[0]\\' }, { name: '\\opcode[1]\\' }];
  const r = backAnnotateUcf(ucf, pins, { ports, tool: 'Silinx toolchain', date: '2026-10-12' });
  assert.deepEqual(r.added, [{ net: '_opcode[1]_', loc: 'K3' }, { net: 'led<1>', loc: 'H12' }, { net: 'led<2>', loc: 'H13' }, { net: 'sw', loc: 'J14' }]);
  assert.deepEqual(r.lines, ['NET "_opcode[1]_" LOC = "K3";', 'NET "led<1>" LOC = "H12";', 'NET "led<2>" LOC = "H13";', 'NET "sw" LOC = "J14";']);
  assert.equal(r.text, `${ucf}
# Back-annotated pin locations (Silinx toolchain, 2026-10-12)
NET "_opcode[1]_" LOC = "K3";
NET "led<1>" LOC = "H12";
NET "led<2>" LOC = "H13";
NET "sw" LOC = "J14";
`);
  // the result: every port bit has its LOC, the user's IOSTANDARD and timing are still there
  const back = parseUcf(r.text, { ports });
  assert.deepEqual(back.assignments['led<1>'], { iostandard: 'LVCMOS33', loc: 'H12' });
  assert.deepEqual(back.clocks, [{ net: 'clk', name: 'TS_clk', tnm: 'clk', period: 20, duty: 50 }]);
  // a LOC written in another case is the same net; nothing more to add the second time
  assert.deepEqual(backAnnotateUcf(r.text.replace('"sw"', '"SW"'), pins, { ports }), { added: [], lines: [], text: null });
  // no UCF yet: the pins alone (ISE's pin2ucf file, with its comments, reads the same)
  const fresh = backAnnotateUcf(null, '#PACE: Start of Constraints generated by PACE\nNET "clk"  LOC = "B8"  ;\n', { date: '2026-10-12' });
  assert.equal(fresh.text, '# Back-annotated pin locations (pin2ucf, 2026-10-12)\nNET "clk" LOC = "B8";\n');
});

// #773: a NET name with wildcards (* any characters, ? one) constrains every port bit it matches, each attribute the
// last statement's that sets it (an exact name after a wildcard overrides it, a wildcard after an exact name too);
// a wildcard that matches no port bit is reported (unmatched)
test('portAssignments: NET wildcards <*>, * and ? on the port bits, the last statement per attribute, the ones matching nothing (#773)', async () => {
  const { portAssignments, ucfPattern } = await import('../packages/silinx-fpga/src/ucf.js');
  const names = ['clk', 'sw<0>', 'sw<1>', 'sw<10>', 'led<0>', 'led<1>', 'ld7'];
  const u = parseUcf(`NET "led<0>" LOC = "M5" | IOSTANDARD = LVTTL;
NET "led<*>" IOSTANDARD = LVCMOS33;
NET "sw*" IOSTANDARD = LVCMOS33 | PULLUP;
NET "sw<?>" PULLDOWN;
NET "led<1>" IOSTANDARD = LVCMOS18 | LOC = M11;
NET "LD?" SLEW = FAST | DRIVE = 4;
NET "foo*" IOSTANDARD = LVCMOS33;
NET "x?" PULLUP;`);
  // the parsed assignments keep the names as written (the editors show them so)
  assert.deepEqual(Object.keys(u.assignments), ['led<0>', 'led<*>', 'sw*', 'sw<?>', 'led<1>', 'LD?', 'foo*', 'x?']);
  const r = portAssignments(u, names);
  assert.deepEqual(r.assignments, {
    'led<0>': { loc: 'M5', iostandard: 'LVCMOS33' },
    'led<1>': { iostandard: 'LVCMOS18', loc: 'M11' },
    'sw<0>': { iostandard: 'LVCMOS33', pull: 'down' },
    'sw<1>': { iostandard: 'LVCMOS33', pull: 'down' },
    'sw<10>': { iostandard: 'LVCMOS33', pull: 'up' },
    ld7: { slew: 'fast', drive: 4 },
  });
  assert.deepEqual(r.unmatched, ['foo*', 'x?']);
  // no wildcard: the assignments as parsed (a name no port has kept too)
  assert.deepEqual(portAssignments(parseUcf('NET "a" LOC = P3;\nNET "a" PULLUP;\nNET "b" SLEW = FAST;'), ['a']), { assignments: { a: { loc: 'P3', pull: 'up' }, b: { slew: 'fast' } }, unmatched: [] });
  // the assignments alone (no statement order): in the order of their names
  assert.deepEqual(portAssignments({ assignments: { 'q<*>': { iostandard: 'LVTTL' }, 'q<1>': { iostandard: 'LVCMOS33' } } }, ['q<0>', 'q<1>']).assignments,
    { 'q<0>': { iostandard: 'LVTTL' }, 'q<1>': { iostandard: 'LVCMOS33' } });
  assert.deepEqual(portAssignments(null, ['a']), { assignments: {}, unmatched: [] });
  // the pattern: the name's other characters literally
  assert.ok(ucfPattern('a.b<*>').test('a.b<12>'));
  assert.ok(!ucfPattern('a.b<*>').test('axb<1>'));
  assert.ok(ucfPattern('d(?)').test('d(1)') && !ucfPattern('d(?)').test('d(10)'));
});

// #2199: a one-bit bus port (btn : in std_logic_vector(0 downto 0)) is btn in the netlist, btn<0> in the UCF (as XST
// names it): its constraints go to the port bit btn, written btn<0>, btn(0) or btn[0]; a name no port has stays as
// written, and Check Constraints still reports it
test('portAssignments: x<0> on a one-bit bus port x, its LOC and other attributes; a bit no port has kept as written (#2199)', async () => {
  const { portAssignments } = await import('../packages/silinx-fpga/src/ucf.js');
  const ports = [{ name: 'btn', dir: 'in', width: 1, msb: 0, lsb: 0 }, { name: 'sw', dir: 'in', width: 1, msb: 0, lsb: 0 }, { name: 'led', dir: 'out', width: 2, msb: 1, lsb: 0 }];
  const text = 'NET "btn<0>" LOC = "G12" | IOSTANDARD = LVCMOS33;\nNET "sw(0)" LOC = "P11";\nNET "led[1]" LOC = "M11";\nNET "q<0>" LOC = "M5";\nNET "btn<1>" LOC = "C11";\nNET "led<0>" LOC = "P6";';
  const r = portAssignments(parseUcf(text, { ports: [{ name: 'btn' }, { name: 'sw' }, { name: 'led', msb: 1, lsb: 0 }] }), ['btn', 'sw', 'led<0>', 'led<1>'], { oneBitBuses: ['btn', 'sw'] });
  assert.deepEqual(r, { assignments: { btn: { loc: 'G12', iostandard: 'LVCMOS33' }, sw: { loc: 'P11' }, 'led<1>': { loc: 'M11' }, 'q<0>': { loc: 'M5' }, 'btn<1>': { loc: 'C11' }, 'led<0>': { loc: 'P6' } }, unmatched: [] });
  // a port bit named as written wins (a bus x of one bit x<0>, as Silinx's netlists of the wider buses name them)
  assert.deepEqual(portAssignments(parseUcf('NET "x<0>" LOC = "G12";'), ['x', 'x<0>'], { oneBitBuses: ['x'] }).assignments, { 'x<0>': { loc: 'G12' } });
  // a scalar port x (std_logic): x<0> is not its name, kept as written (#2229, as ngdbuild: #84)
  assert.deepEqual(portAssignments(parseUcf('NET "x<0>" LOC = "G12";\nNET "y(0)" LOC = "P11";'), ['x', 'y'], { oneBitBuses: [] }).assignments, { 'x<0>': { loc: 'G12' }, 'y<0>': { loc: 'P11' } });
  assert.deepEqual(portAssignments(parseUcf('NET "x<0>" LOC = "G12";'), ['x']).assignments, { 'x<0>': { loc: 'G12' } });
  // Check Constraints: btn<0> on the one-bit bus is right, the bit it does not have and a name no port has are errors
  assert.deepEqual(checkUcf(text, { top: 'top', ports, package: 'cp132' }).map(d => [d.line, d.severity, d.message]), [
    [2, 'warning', 'use sw<0> for a bus bit in UCF (the default bus delimiter is <>)'],
    [3, 'warning', 'use led<1> for a bus bit in UCF (the default bus delimiter is <>)'],
    [4, 'error', 'NET "q<0>" does not exist in the top module \'top\' (no port named \'q\')'],
    [5, 'error', 'bit 1 is out of range for \'btn\' (0 downto 0)'],
  ]);
});

// #773, measured with ISE 14.7: ngdbuild applies a wildcard NET to every net it matches, ignoring case ("LD*" found ld7),
// and stops on one that matches no design object (ERROR:ConstraintSystem:58 - … NET "foo*" does not match any design
// objects); Check Constraints reports one matching no port: an error with I/O attributes, a warning with timing ones
test('checkUcf: NET wildcards matching port bits are accepted (any case), one matching none an error, or a warning for timing (#773)', () => {
  assert.deepEqual(chk('NET "led<*>" IOSTANDARD = LVCMOS33;\nNET "SW*" PULLUP;\nNET "led<?>" DRIVE = 4;\nNET "c?k" TNM_NET = "clk";\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns;\nNET "u0/*" KEEP = TRUE;'), []);
  assert.deepEqual(chk('NET "foo*" IOSTANDARD = LVCMOS33;\nNET "led<1?>" DRIVE = 4;\nNET "cnt*" TNM_NET = "g";').map(d => [d.line, d.col, d.severity, d.message]), [
    [1, 6, 'error', 'NET "foo*" matches no port of the top module \'top\' (ISE: "does not match any design objects")'],
    [2, 6, 'error', 'NET "led<1?>" matches no port of the top module \'top\' (ISE: "does not match any design objects")'],
    [3, 6, 'warning', 'NET "cnt*" matches no port of the top module \'top\' (timing constraints on internal nets are resolved after synthesis)'],
  ]);
  // without the ports (no elaboration): not checked
  assert.deepEqual(checkUcf('NET "foo*" IOSTANDARD = LVCMOS33;'), []);
});

// #1508: Emulate and Program FPGA ask first when the UCF places no pin
test('ucfPlacesPins: a LOC on any net places the pins; no UCF, an empty one, comments, an IOSTANDARD or a timing constraint alone do not', () => {
  assert.equal(ucfPlacesPins('NET "led<0>" LOC = "M5";'), true);
  assert.equal(ucfPlacesPins('# the clock\nNET "clk" IOSTANDARD = LVCMOS33;\nNET "sw<1>" LOC = P11 | IOSTANDARD = LVCMOS33;'), true);
  assert.equal(ucfPlacesPins('net clk loc = B8;'), true);   // (UCF keywords are case-insensitive)
  for (const none of [null, undefined, '', '# nothing yet\n', 'NET "clk" IOSTANDARD = LVCMOS33;', 'NET "clk" TNM_NET = "clk";\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;'])
    assert.equal(ucfPlacesPins(none), false, JSON.stringify(none));
});

test('#2011 normalizePort, periodNs, backAnnotateUcf: linear on a long run of spaces (CodeQL js/polynomial-redos), same results', () => {
  const sp = ' '.repeat(100000), ms = f => { const t = performance.now(); f(); return performance.now() - t; };
  assert.ok(ms(() => assert.throws(() => normalizePort(`A${sp}x`), /bad port spec/)) < 1000);
  assert.ok(ms(() => assert.throws(() => periodNs(`.${sp}x`), /bad clock period/)) < 1000);
  assert.ok(ms(() => backAnnotateUcf(`${sp}x`, 'NET "led" LOC = "P1";')) < 1000);
  // (the spaces around still allowed)
  assert.deepEqual(normalizePort('  led [7:0]  '), { name: 'led', msb: 7, lsb: 0, width: 8, bus: true });
  assert.deepEqual(normalizePort(' clk '), { name: 'clk', msb: null, lsb: null, width: 1, bus: false });
  assert.equal(periodNs(' 50 MHz '), 20);
  assert.equal(periodNs('20ns'), 20);
  assert.equal(backAnnotateUcf('NET "clk" LOC = "B8";  \n\n ', 'NET "led" LOC = "P1";', { date: 'D' }).text,
    'NET "clk" LOC = "B8";\n\n# Back-annotated pin locations (pin2ucf, D)\nNET "led" LOC = "P1";\n');
});

test('ucfPattern: as the RegExp of the name on every small case, and linear on a name built to be slow (#2551)', async () => {
  const { portAssignments, ucfPattern } = await import('../packages/silinx-fpga/src/ucf.js');
  const asRegExp = (name, flags) => new RegExp(`^${name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, flags);
  const words = (alphabet, n) => (n === 0 ? [''] : words(alphabet, n - 1).flatMap(w => ['', ...alphabet].map(c => w + c)));
  const patterns = [...new Set(words(['a', 'B', '*', '?', '<', '.'], 4))];
  const names = [...new Set(words(['a', 'b', '<', '.'], 3))];
  for (const flags of ['', 'i']) for (const p of patterns) {
    const m = ucfPattern(p, flags), re = asRegExp(p, flags);
    for (const n of names) assert.equal(m.test(n), re.test(n), `${p} ${flags} on ${n}`);
  }
  assert.equal(ucfPattern('a*').test('a\nb'), false, 'a wildcard stays on one line');
  const t0 = Date.now();
  const r = portAssignments({ assignments: { [`${'a*'.repeat(12)}b`]: { loc: 'P1' } } }, ['a'.repeat(64)]);
  assert.deepEqual(r, { assignments: {}, unmatched: [`${'a*'.repeat(12)}b`] });
  assert.ok(Date.now() - t0 < 1000, 'no exponential time');
});
