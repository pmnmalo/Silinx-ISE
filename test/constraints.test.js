import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UCF, constraintsFor, readConstraints } from '../packages/silinx-fpga/src/constraints.js';
import { parseUcf, portAssignments } from '../packages/silinx-fpga/src/ucf.js';

const TEXT = `# a design
NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;
NET "led<0>" LOC = "M5" | DRIVE = 8 | SLEW = FAST ;
NET "btn" LOC = "G12" | PULLDOWN ;
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
INST "dcm" LOC = "DCM_X0Y0" ;
OFFSET = IN 5 ns BEFORE "clk" ;
`;
const data = ({ assignments, netStatements, clocks, other }) => ({ assignments, netStatements, clocks, other });

test('the UCF model is what parseUcf reads, with its format and name', () => {
  const m = readConstraints(UCF, TEXT, 'top.ucf');
  assert.deepEqual(data(m), data(parseUcf(TEXT)));
  assert.equal(m.format, 'ucf');
  assert.equal(m.name, 'top.ucf');
  assert.deepEqual(m.assignments.btn, { loc: 'G12', pull: 'down' });
  assert.deepEqual(m.other, ['INST "dcm" LOC = "DCM_X0Y0"', 'OFFSET = IN 5 ns BEFORE "clk"']);
});

test('no text: no model', () => {
  assert.equal(readConstraints(UCF, null), null);
  assert.equal(readConstraints(UCF, ''), null);
});

test('UCF round trip: the model written and read again is the same', () => {
  const m = readConstraints(UCF, TEXT);
  const again = readConstraints(UCF, UCF.write(m));
  for (const k of ['assignments', 'clocks']) assert.deepEqual(again[k], m[k], k);
  assert.deepEqual(new Set(again.other), new Set(m.other));
  assert.deepEqual(UCF.write(again), UCF.write(m));
});

test('the bus bits depend on the ports: forPorts reads them as parseUcf does, without changing the model', () => {
  const text = 'NET "x(1)" LOC = "A1" ;\nNET "y[0]" LOC = "A2" ;\n';
  const m = readConstraints(UCF, text);
  assert.deepEqual(Object.keys(m.assignments), ['x<1>', 'y<0>']);
  const ports = [{ name: 'x', msb: 1, lsb: 0 }, 'y'];
  assert.deepEqual(data(m.forPorts(ports)), data(parseUcf(text, { ports })));
  assert.deepEqual(Object.keys(m.assignments), ['x<1>', 'y<0>']);
});

test('constraintsFor takes a model, UCF text, a parsed result or nothing', () => {
  const ports = [{ name: 'x', msb: 1, lsb: 0 }];
  const text = 'NET "x(1)" LOC = "A1" ;\n';
  const parsed = parseUcf(text, { ports });
  assert.deepEqual(data(constraintsFor(readConstraints(UCF, text), ports)), data(parsed));
  assert.deepEqual(data(constraintsFor(text, ports)), data(parsed));
  assert.equal(constraintsFor(parsed, ports), parsed);
  assert.equal(constraintsFor(null, ports), null);
});

test('the wildcards work on the model as on the parsed UCF', () => {
  const m = readConstraints(UCF, 'NET "led*" IOSTANDARD = LVCMOS33 ;\nNET "led<0>" LOC = "M5" ;\n');
  assert.deepEqual(portAssignments(m, ['led<0>', 'led<1>']).assignments, { 'led<0>': { iostandard: 'LVCMOS33', loc: 'M5' }, 'led<1>': { iostandard: 'LVCMOS33' } });
});
