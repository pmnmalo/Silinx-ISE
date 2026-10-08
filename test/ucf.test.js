import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateUcf, parseUcf, expandPort, normalizePort, periodNs, bitName } from '../core/ucf.js';

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
  const { boardAutoAssign, locsNotOnBoard, generateUcf, parseUcf } = await import('../core/ucf.js');
  const { resolveBoard } = await import('../server/devices.js');
  const rb = resolveBoard('basys2');
  const board = { ...rb.board, device: rb.device, resources: rb.resources };
  const ports = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }, { name: 'foo', dir: 'out', width: 1 }];
  const r = boardAutoAssign(ports, board);
  assert.equal(r.assignments.clk.loc, 'B8');
  assert.equal(r.assignments['sw<3>'].loc, 'B4');
  assert.equal(r.assignments['led<7>'].loc, 'G1');
  assert.deepEqual(r.unmatched, ['foo']);
  const ucf = parseUcf(generateUcf({ ports, assignments: r.assignments, clocks: r.clocks }));
  assert.deepEqual(locsNotOnBoard(ucf.assignments, board), []);
  assert.deepEqual(locsNotOnBoard({ 'led<1>': { loc: 'E12' } }, board), [{ net: 'led<1>', loc: 'E12' }]);
});

// ---- checkUcf
import { checkUcf } from '../core/ucf.js';
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
  const at = (line, re) => assert.ok(d.some(x => x.line === line && x.severity === 'error' && re.test(x.message)), `line ${line}: ${re}\n${JSON.stringify(d, null, 1)}`);
  at(1, /out of range/);
  at(2, /does not exist in the top module/);
  at(3, /4-bit bus/);
  at(4, /already assigned to NET "led<9>"/);
  at(4, /invalid DRIVE/);
  at(5, /IOSTANDARD 'LVDS_99'/);
  at(6, /timing group "nope"/);
  at(7, /not a UCF statement/);
  at(8, /single bit/);
  at(9, /missing ';'/);
});

test('checkUcf: timing constraints on internal nets are warnings; QFP pins and board pins are checked', () => {
  assert.equal(chk('NET "cnt_en" TNM_NET = "x";\nTIMEGRP "x" = FFS;').filter(d => d.severity === 'error').length, 0);
  assert.ok(chk('NET "clk" LOC = P200;', { package: 'vq100' }).some(d => d.severity === 'error' && /P1…P100/.test(d.message)));
  const board = { name: 'B', resources: [{ name: 'clk', pins: ['B8'] }] };
  assert.match(checkUcf('NET "clk" LOC = C9;', { top: 'top', ports: [PORTS[0]], board })[0].message, /not connected to any resource/);
});

test('parseUcf: bus bits written as a(0) or a[0] map to a<0>', () => {
  const a = parseUcf('NET "sw(0)" LOC = "P11";\nNET sw[1] LOC = L3;\nNET "led<2>" LOC = "P7";').assignments;
  assert.equal(a['sw<0>'].loc, 'P11');
  assert.equal(a['sw<1>'].loc, 'L3');
  assert.equal(a['led<2>'].loc, 'P7');
});
