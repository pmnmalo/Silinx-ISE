// The port bits a board has no resource for, on the free pins of its headers (#3709): boardAutoAssign puts them there
// in the order of the ports (an input with a pull-down, a serial rx with a pull-up), each with its UCF comment; what no
// header pin is left for stays unmatched; a board with no headers leaves them unmatched, as before. ISE's build of such
// a project (the clock example on the Mimas V2, its an<3>: the board has 3 digits) is then not refused, and warns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boardAutoAssign, generateUcf } from '../packages/silinx-fpga/src/parts.js';

const BOARD = {
  name: 'Test board',
  resources: [
    { name: 'clk', pins: ['C1'], dir: 'in', group: 'Clock', extra: { period: '10 ns' } },
    { name: 'led', pins: ['L1', 'L2'], dir: 'out', group: 'LEDs' },
    { name: 'hdr', pins: ['H1', 'H2', 'H3', 'H4'], dir: 'inout', group: 'Headers' },
  ],
};
const PORTS = [
  { name: 'clk', dir: 'in', width: 1, msb: null, lsb: null },
  { name: 'led', dir: 'out', width: 3, msb: 2, lsb: 0 },
  { name: 'go', dir: 'in', width: 1, msb: null, lsb: null },
  { name: 'rx', dir: 'in', width: 1, msb: null, lsb: null },
  { name: 'y', dir: 'out', width: 2, msb: 1, lsb: 0 },
];

test('#3709 the bits a board has no pin for go on its headers\' free pins, in the order of the ports', () => {
  const r = boardAutoAssign(PORTS, BOARD);
  assert.deepEqual(r.unmatched, ['y[1..]']);   // (4 header pins: led<2>, go, rx, y<0>)
  assert.deepEqual(r.onHeaders, [
    { port: 'led', nets: [['led<2>', 'hdr<0>']] }, { port: 'go', nets: [['go', 'hdr<1>']] },
    { port: 'rx', nets: [['rx', 'hdr<2>']] }, { port: 'y', nets: [['y<0>', 'hdr<3>']] }]);
  assert.deepEqual(r.matched, ['clk', 'led', 'go', 'rx', 'y']);
  const ucf = generateUcf({ ports: PORTS, assignments: r.assignments, clocks: r.clocks });
  assert.match(ucf, /^NET "led<1>"\s+LOC = "L2" ;$/m);
  assert.match(ucf, /^NET "led<2>"\s+LOC = "H1" ;  # no pin on the board: on the header pin hdr<0>$/m);
  assert.match(ucf, /^NET "go"\s+LOC = "H2" \| PULLDOWN ;  # no pin on the board: on the header pin hdr<1>$/m);
  assert.match(ucf, /^NET "rx"\s+LOC = "H3" \| PULLUP ;  # no pin on the board: on the header pin hdr<2>$/m);
  assert.match(ucf, /^NET "y<0>"\s+LOC = "H4" ;  # no pin on the board: on the header pin hdr<3>$/m);
  assert.match(ucf, /^# NET "y<1>"\s+LOC = "" ;  # unassigned$/m);
});

test('#3709 a header pin a port took by name is not taken again; a board with no headers leaves the bits unmatched', () => {
  const ports = [{ name: 'hdr', dir: 'out', width: 1, msb: null, lsb: null }, { name: 'z', dir: 'out', width: 1, msb: null, lsb: null }];
  const r = boardAutoAssign(ports, BOARD);
  assert.equal(r.assignments.hdr.loc, 'H1');
  assert.deepEqual(r.onHeaders, [{ port: 'z', nets: [['z', 'hdr<1>']] }]);
  const none = boardAutoAssign(PORTS, { name: 'No headers', resources: BOARD.resources.filter(x => x.group !== 'Headers') });
  assert.deepEqual(none.unmatched, ['led[2..]', 'go', 'rx', 'y']);
  assert.deepEqual(none.onHeaders, []);
  // (byDirection's switches and LEDs first: the headers take what is left)
  const by = boardAutoAssign(PORTS, BOARD, { byDirection: true });
  assert.deepEqual(by.unmatched, ['y[1..]']);
});

test('#3709 ISE\'s build of the clock example on the Mimas V2: not refused, its an<3> on a header pin warned', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-headers-'));
  try {
    const { exampleProject } = await import('./examples-lib.mjs');
    const ise = await import('../server/ise.js');
    const { dir, project } = exampleProject('clock', { board: 'mimas-v2' }, tmp);
    const g = await ise.generateBuild(project, dir);
    assert.deepEqual(g.warnings, ['an<3>: the mimas-v2 has no pin for it; it is on the header pin io_p6<0> (the board\'s constraints)']);
    assert.match(fs.readFileSync(path.join(g.buildDir, 'digital_clock.ucf'), 'utf8'), /^NET "an<3>"\s+LOC = "U7" ;/m);
    // (the board's constraints of the old table: an<0..3> and dp with no pin, refused)
    fs.writeFileSync(path.join(dir, project.constraints), fs.readFileSync(path.join(dir, project.constraints), 'utf8').replace(/^NET "(an<\d>|dp)".*$/gm, ''));
    await assert.rejects(ise.generateBuild(project, dir), /5 top-level port bit\(s\) have no pin location \(LOC\) for the mimas-v2 board: an<0>, an<1>, an<2>, an<3>, dp/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// (#3741) the Elbert V2's display on its own pins: ISE's build of the examples warns of an<3> alone (3 digits), and of the
// uart's rx and tx (no USB-UART on the board), not of the display's an<0..2> and dp, which the old table put on headers
test('#3741 ISE\'s build of the examples on the Elbert V2: only an<3> (and the uart\'s rx, tx) on header pins, warned', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-headers-'));
  try {
    const { exampleProject, EXAMPLES } = await import('./examples-lib.mjs');
    const ise = await import('../server/ise.js');
    const on = (bit, pin) => `${bit}: the elbert-v2 has no pin for it; it is on the header pin io_p1<${pin}> (the board's constraints)`;
    const expected = { gates: [], vga: [], uart: [on('rx', 0), on('tx', 1), on('an<3>', 2)] };
    for (const name of EXAMPLES) {
      const { dir, project } = exampleProject(name, { board: 'elbert-v2' }, path.join(tmp, name));
      const g = await ise.generateBuild(project, dir);
      assert.deepEqual(g.warnings, expected[name] ?? [on('an<3>', 0)], name);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
