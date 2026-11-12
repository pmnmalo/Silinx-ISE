// A net, a port or a timing name that is the name of a property every object inherits (__proto__, constructor,
// toString, hasOwnProperty) is a name as any other in the constraints' readers: its constraints are its own, and
// nothing inherited is read or changed, for that file or for the ones read after it (#3553).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardAutoAssign, byName, generateUcf, parseUcf, portAssignments, setByName } from '../packages/silinx-fpga/src/ucf.js';
import { readXdc, writeXdc } from '../packages/silinx-fpga/src/xdc.js';
import { PCF } from '../packages/silinx-fpga/src/pcf.js';
import { LPF } from '../packages/silinx-fpga/src/lpf.js';
import { CST } from '../packages/silinx-fpga/src/cst.js';
import { UCF, readConstraints } from '../packages/silinx-fpga/src/constraints.js';

const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];
const objectProto = () => Object.getOwnPropertyNames(Object.prototype).sort();
const PROTO = objectProto();
// what every object inherits is as it was: no property added, none of the model's on a new object
function untouched() {
  assert.deepEqual(objectProto(), PROTO);
  for (const k of ['loc', 'iostandard', 'pull', 'drive', 'slew']) assert.equal({}[k], undefined, k);
  assert.equal(typeof {}.constructor, 'function');
  assert.equal(typeof {}.toString, 'function');
}
// the model's own entries, as plain data
const own = assignments => Object.entries(assignments).map(([n, a]) => [n, { ...a }]);

// each reader: a file with the name's pin and a second net's, and the pin it gives
const READERS = {
  ucf: { read: t => parseUcf(t), text: n => `NET "${n}" LOC = P1 | PULLUP ;\nNET "x" IOSTANDARD = LVCMOS33 ;\n`,
    want: n => [[n, { loc: 'P1', pull: 'up' }], ['x', { iostandard: 'LVCMOS33' }]], other: 'NET "y" DRIVE = 8 ;\n', otherWant: [['y', { drive: 8 }]] },
  xdc: { read: t => readXdc(t), text: n => `set_property -dict { PACKAGE_PIN E3 PULLTYPE PULLUP } [get_ports ${n}]\nset_property IOSTANDARD LVCMOS33 [get_ports x]\n`,
    want: n => [[n, { loc: 'E3', pull: 'up' }], ['x', { iostandard: 'LVCMOS33' }]], other: 'set_property DRIVE 8 [get_ports y]\n', otherWant: [['y', { drive: 8 }]] },
  pcf: { read: t => PCF.read(t), text: n => `set_io -pullup yes ${n} 10\nset_io x 11\n`,
    want: n => [[n, { pull: 'up', loc: '10' }], ['x', { loc: '11' }]], other: 'set_io y 12\n', otherWant: [['y', { loc: '12' }]] },
  lpf: { read: t => LPF.read(t), text: n => `LOCATE COMP "${n}" SITE "B2";\nIOBUF PORT "${n}" PULLMODE=UP;\nIOBUF PORT "x" IO_TYPE=LVCMOS33;\n`,
    want: n => [[n, { loc: 'B2', pull: 'up' }], ['x', { iostandard: 'LVCMOS33' }]], other: 'LOCATE COMP "y" SITE "C3";\n', otherWant: [['y', { loc: 'C3' }]] },
  cst: { read: t => CST.read(t), text: n => `IO_LOC "${n}" 10;\nIO_PORT "${n}" PULL_MODE=UP;\nIO_PORT "x" IO_TYPE=LVCMOS33;\n`,
    want: n => [[n, { loc: '10', pull: 'up' }], ['x', { iostandard: 'LVCMOS33' }]], other: 'IO_LOC "y" 12;\n', otherWant: [['y', { loc: '12' }]] },
};

for (const [format, r] of Object.entries(READERS)) {
  test(`${format}: a net named as an inherited property has its own constraints, and the next file reads nothing of them`, () => {
    for (const n of NAMES) {
      const m = r.read(r.text(n));
      assert.deepEqual(own(m.assignments), r.want(n), `${format} ${n}`);
      assert.deepEqual({ ...byName(m.assignments, n) }, r.want(n)[0][1]);
      assert.deepEqual(m.netStatements.map(s => s.net).filter(x => x === n).length > 0, true);
      untouched();
      // a later file, of other nets: only its own
      const next = r.read(r.other);
      assert.deepEqual(own(next.assignments), r.otherWant, `${format} after ${n}`);
      assert.equal(byName(next.assignments, n), undefined);
      untouched();
    }
  });
}

test('the writers write such a net as any other, and it reads back the same', () => {
  for (const n of NAMES) {
    const ucf = parseUcf(READERS.ucf.text(n));
    assert.deepEqual(own(parseUcf(generateUcf(ucf)).assignments), own(ucf.assignments));
    assert.match(generateUcf({ ports: [n], assignments: ucf.assignments }), new RegExp(`^NET "${n}" +LOC = "P1" \\| PULLUP ;$`, 'm'));
    // a port of that name with no constraint: unassigned, not what the object inherits
    assert.match(generateUcf({ ports: [n], assignments: {} }), new RegExp(`^# NET "${n}" +LOC = "" ;  # unassigned$`, 'm'));
    const xdc = readXdc(READERS.xdc.text(n));
    assert.deepEqual(own(readXdc(writeXdc(xdc).text).assignments), own(xdc.assignments));
    for (const f of [PCF, LPF, CST]) {
      const m = f.read(READERS[f.id].text(n));
      assert.deepEqual(own(f.read(f.write(m)).assignments), own(m.assignments), `${f.id} ${n}`);
    }
    untouched();
  }
});

test('UCF timing names: a TNM_NET named constructor or toString is a clock of its net; a TIMESPEC on a name no NET defines is kept', () => {
  for (const n of NAMES) {
    const m = parseUcf(`NET "clk" TNM_NET = "${n}" ;\nTIMESPEC "TS_clk" = PERIOD "${n}" 20 ns HIGH 50% ;\n`);
    assert.deepEqual(m.clocks, [{ net: 'clk', name: 'TS_clk', tnm: n, period: 20, duty: 50 }], n);
    assert.deepEqual(m.other, []);
    const lone = parseUcf(`TIMESPEC "TS_x" = PERIOD "${n}" 20 ns HIGH 50% ;\n`);
    assert.deepEqual(lone.clocks, [], n);
    assert.deepEqual(lone.other, [`TIMESPEC "TS_x" = PERIOD "${n}" 20 ns HIGH 50%`]);
  }
  untouched();
});

test('the model of a format (readConstraints, forPorts) and portAssignments keep such a name, by exact name and by wildcard', () => {
  for (const n of NAMES) {
    const text = READERS.ucf.text(n);
    const m = readConstraints(UCF, text, 'top.ucf');
    assert.deepEqual(own(m.forPorts([n, 'x']).assignments), own(m.assignments));
    assert.deepEqual(own(portAssignments(m, [n, 'x']).assignments), READERS.ucf.want(n));
    const wild = portAssignments(parseUcf('NET "*" IOSTANDARD = LVTTL ;\n'), [n, 'x']);
    assert.deepEqual(own(wild.assignments), [[n, { iostandard: 'LVTTL' }], ['x', { iostandard: 'LVTTL' }]]);
    assert.deepEqual(wild.unmatched, []);
  }
  untouched();
});

test('boardAutoAssign gives a port named as an inherited property its pin, by its direction', () => {
  const board = { resources: [{ name: 'sw', group: 'Switches', dir: 'in', pins: ['P11'] }, { name: 'led', group: 'LEDs', dir: 'out', pins: ['M5'] }] };
  for (const n of NAMES) {
    const r = boardAutoAssign([{ name: n, dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }], board, { byDirection: true });
    assert.deepEqual(own(r.assignments), [[n, { loc: 'P11' }], ['y', { loc: 'M5' }]], n);
    assert.deepEqual(r.unmatched, []);
    assert.deepEqual(r.matched, [n, 'y']);
  }
  untouched();
});

test('byName and setByName: an own property only, written as one', () => {
  const t = {};
  assert.equal(byName(t, 'constructor'), undefined);
  assert.equal(byName(t, '__proto__'), undefined);
  setByName(t, '__proto__', { loc: 'A1' });
  assert.equal(Object.getPrototypeOf(t), Object.prototype);
  assert.deepEqual(Object.keys(t), ['__proto__']);
  assert.deepEqual(byName(t, '__proto__'), { loc: 'A1' });
  assert.deepEqual(JSON.parse(JSON.stringify(t)), JSON.parse('{"__proto__":{"loc":"A1"}}'));
  untouched();
});
