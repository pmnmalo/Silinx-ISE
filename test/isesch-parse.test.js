// ISE schematic / symbol readers (core/isesch.js): the XML format (drawing version 7) and the legacy
// text format (VERSION 6 schematics, VERSION 5 symbols) give the same model for the same drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIseSch, parseIseSym, importIseSch, exportIseSch } from '../core/isesch.js';

const XML = `﻿<?xml version="1.0" encoding="UTF-8"?>
<drawing version="7">
    <attr value="spartan3e" name="DeviceFamilyName" />
    <netlist>
        <signal name="A" />
        <signal name="Y">
            <attr value="KEEP" name="KEEP" />
        </signal>
        <signal name="B(1:0)" />
        <port polarity="Input" name="A" />
        <port polarity="BiDirectional" name="B(1:0)" />
        <port polarity="Output" name="Y" />
        <blockdef name="mysym">
            <timestamp>2001-2-3T4:5:6</timestamp>
            <rect width="128" x="64" y="-128" height="128" />
            <line x2="64" y1="-96" y2="-96" x1="0" />
            <line x2="256" y1="-96" y2="-96" x1="192" style="linewidth:W" />
            <circle r="16" cx="208" cy="-96" />
            <arc ex="144" ey="-144" sx="144" sy="-48" r="48" cx="144" cy="-96" />
            <text x="80" y="-64">label</text>
            <attrtext attrname="InstName" x="0" y="-160" />
        </blockdef>
        <block symbolname="mysym" name="U1">
            <attr value="4" name="WIDTH" />
            <blockpin signalname="A" name="I" />
            <blockpin signalname="Y" name="O" />
            <blockpin name="NC" />
        </block>
    </netlist>
    <sheet sheetnum="1" width="1760" height="1360">
        <instance x="400" y="400" name="U1" orien="M90" />
        <branch name="A">
            <attrtext attrname="Name" x="300" y="304" style="fontsize:28" />
            <attrtext attrname="Other" x="1" y="1" />
            <wire x2="400" y1="304" y2="304" x1="240" />
        </branch>
        <iomarker fontsize="28" x="240" y="304" name="A" orien="R180" />
        <bustap x2="500" y1="600" y2="600" x1="420" />
        <text x="100" y="100">a note</text>
    </sheet>
</drawing>`;

const V6 = `VERSION 6
BEGIN SCHEMATIC
    BEGIN ATTR DeviceFamilyName "spartan3e"
        DELETE all:0
    END ATTR
    BEGIN NETLIST
        SIGNAL A
        BEGIN SIGNAL Y
            BEGIN ATTR KEEP "KEEP"
            END ATTR
        END SIGNAL
        SIGNAL B(1:0)
        PORT Input A
        PORT BiDirectional B(1:0)
        PORT Output Y
        BEGIN BLOCKDEF mysym
            TIMESTAMP 2001 2 3 4 5 6
            RECTANGLE N 64 -128 192 0
            LINE N 0 -96 64 -96
            BEGIN LINE W 192 -96 256 -96
            END LINE
            CIRCLE N 192 -112 224 -80
            ARC N 96 -144 192 -48 144 -48 144 -144
            BEGIN DISPLAY 0 -160 ATTR InstName
            END DISPLAY
        END BLOCKDEF
        BEGIN BLOCK U1 mysym
            BEGIN ATTR WIDTH "4"
            END ATTR
            PIN I A
            PIN O Y
            PIN NC
        END BLOCK
    END NETLIST
    BEGIN SHEET 1 1760 1360
        BEGIN INSTANCE U1 400 400 M90
        END INSTANCE
        BEGIN BRANCH A
            WIRE 240 304 400 304
            BEGIN DISPLAY 300 304 ATTR Name
                ALIGNMENT SOFT-BCENTER
            END DISPLAY
        END BRANCH
        IOMARKER 240 304 A R180 28
        BUSTAP 420 600 500 600
        BEGIN DISPLAY 100 100 TEXT a note
        END DISPLAY
    END SHEET
END SCHEMATIC
`;

test('parseIseSch (XML): attributes, signals with attributes, ports, blockdef shapes, blocks, sheet items', () => {
  const m = parseIseSch(XML);
  assert.equal(m.version, 7);
  assert.deepEqual(m.attrs, { DeviceFamilyName: 'spartan3e' });
  assert.deepEqual(m.signals.map(s => s.name), ['A', 'Y', 'B(1:0)']);
  assert.deepEqual(m.signals[1].attrs, { KEEP: 'KEEP' });
  assert.deepEqual(m.ports, [{ name: 'A', polarity: 'Input' }, { name: 'B(1:0)', polarity: 'BiDirectional' }, { name: 'Y', polarity: 'Output' }]);
  const def = m.blockdefs.get('mysym');
  assert.equal(def.timestamp, '2001-2-3T4:5:6');
  assert.deepEqual(def.shapes.map(s => s.kind), ['rect', 'line', 'line', 'circle', 'arc', 'text', 'text']);
  assert.deepEqual(def.shapes[0], { kind: 'rect', x: 64, y: -128, w: 128, h: 128 });
  assert.equal(def.shapes[2].bus, true);
  assert.equal(def.shapes[5].text, 'label');
  assert.deepEqual(m.blocks, [{ symbol: 'mysym', name: 'U1', attrs: { WIDTH: '4' }, pins: [{ name: 'I', signal: 'A' }, { name: 'O', signal: 'Y' }, { name: 'NC', signal: null }] }]);
  const S = m.sheets[0];
  assert.deepEqual([S.num, S.width, S.height], [1, 1760, 1360]);
  assert.deepEqual(S.instances, [{ name: 'U1', x: 400, y: 400, orien: 'M90' }]);
  assert.deepEqual(S.branches, [{ name: 'A', wires: [[240, 304, 400, 304]], labels: [{ x: 300, y: 304, style: 'fontsize:28' }] }]);
  assert.deepEqual(S.iomarkers, [{ name: 'A', x: 240, y: 304, orien: 'R180' }]);
  assert.deepEqual(S.bustaps, [{ x1: 420, y1: 600, x2: 500, y2: 600 }]);
  assert.deepEqual(S.texts, [{ x: 100, y: 100, text: 'a note' }]);
});

test('parseIseSch (VERSION 6 text) reads the same drawing into the same model', () => {
  const x = parseIseSch(XML), t = parseIseSch(V6);
  assert.equal(t.version, 6);
  assert.deepEqual(t.attrs, x.attrs);
  assert.deepEqual(t.signals, x.signals);
  assert.deepEqual(t.ports, x.ports);
  assert.deepEqual(t.blocks, x.blocks);
  const [dx, dt] = [x.blockdefs.get('mysym'), t.blockdefs.get('mysym')];
  assert.equal(dt.timestamp, dx.timestamp);
  // geometry: the same rectangle, lines (one of them a bus), circle and arc
  assert.deepEqual(dt.shapes.filter(s => s.kind !== 'text'), dx.shapes.filter(s => s.kind !== 'text'));
  const [sx, st] = [x.sheets[0], t.sheets[0]];
  assert.deepEqual(st.instances, sx.instances);
  assert.deepEqual(st.branches.map(b => [b.name, b.wires, b.labels.map(l => [l.x, l.y])]), sx.branches.map(b => [b.name, b.wires, b.labels.map(l => [l.x, l.y])]));
  assert.deepEqual(st.iomarkers, sx.iomarkers);
  assert.deepEqual(st.bustaps, sx.bustaps);
  assert.deepEqual(st.texts, sx.texts);
});

test('parseIseSch rejects files that are not ISE schematics', () => {
  assert.throws(() => parseIseSch('<?xml version="1.0"?><symbol name="x" />'), /not an ISE schematic/);
});

test('parseIseSym: XML symbols (ISE 9+) and VERSION 5 text symbols', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<symbol version="7" name="mysym">
    <symboltype>BLOCK</symboltype>
    <pin polarity="Input" x="0" y="-96" name="I" />
    <pin polarity="Output" x="256" y="-96" name="O" />
    <pin polarity="BiDirectional" x="128" y="0" name="IO" />
    <pin x="0" y="-32" name="D" />
</symbol>`;
  assert.deepEqual(parseIseSym(xml), { name: 'mysym', pins: [
    { name: 'I', dir: 'in', x: 0, y: -96 }, { name: 'O', dir: 'out', x: 256, y: -96 }, { name: 'IO', dir: 'inout', x: 128, y: 0 }, { name: 'D', dir: 'in', x: 0, y: -32 }] });
  const v5 = `VERSION 5
BEGIN SYMBOL mysym
SYMBOLTYPE BLOCK
TIMESTAMP 2001 2 3 4 5 6
SYMPIN 0 -96 Input I
SYMPIN 256 -96 Output O
SYMPIN 128 0 BiDirectional IO
END SYMBOL`;
  assert.deepEqual(parseIseSym(v5), { name: 'mysym', pins: [{ name: 'I', dir: 'in', x: 0, y: -96 }, { name: 'O', dir: 'out', x: 256, y: -96 }, { name: 'IO', dir: 'inout', x: 128, y: 0 }] });
  assert.throws(() => parseIseSym('<drawing version="7" />'), /not an ISE symbol/);
});

test('import of a drawing with a project symbol (.sym): the block gets the symbol pins; export writes it back', () => {
  const sym = `<?xml version="1.0" encoding="UTF-8"?>
<symbol version="7" name="mysym">
    <pin polarity="Input" x="0" y="-96" name="I" />
    <pin polarity="Output" x="256" y="-96" name="O" />
    <pin polarity="Input" x="0" y="-32" name="NC" />
</symbol>`;
  const r = importIseSch(XML, { name: 'top', symbols: { 'mysym.sym': sym } });
  const blk = r.doc.symbols.find(s => s.type === 'hdlblock');
  assert.ok(blk, 'an HDL block for the project symbol');
  assert.deepEqual([...blk.params.inputs.map(p => p.name), ...blk.params.outputs.map(p => p.name)].sort(), ['I', 'NC', 'O']);
  const ex = exportIseSch(r.doc, {});
  const again = parseIseSch(ex.xml);
  assert.equal(again.blocks.length, 1);
  assert.deepEqual(again.blocks[0].pins.filter(p => p.signal).map(p => p.name).sort(), ['I', 'O']);
});
