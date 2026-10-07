import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate, simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins, symbolDef, modulesFromLibrary } from '../core/schdoc.js';
import {
  parseIseSch, parseIseSym, parseXml, importIseSch, exportIseSch, libPins, iseXform, iseOrienToXai, xaiToIseOrien, decodeXlSymbol,
  convertIseSchematics,
} from '../core/isesch.js';

// ------------------------------------------------------------------ helpers
const FIX = new URL('./fixtures/ise-sch/', import.meta.url);
const read = f => fs.readFileSync(new URL(f, FIX), 'utf8');
const FIXTURES = ['MyAND2b4.sch', 'Mux4to1b4.sch', 'list1.sch', 'Counter_2b.sch'];

function runSim(files, top, until = 5e6) {
  const r = simulate(Object.entries(files).map(([path, text]) => ({ path, text })), top, { until });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], 'compile/elaboration errors');
  return r;
}
const logOf = r => r.sim.log.map(l => `${l.kind}:${l.text}`.replace(/^(note|print):/, ''));
function compiles(files, top) {
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  assert.deepEqual(lib.errors.filter(e => e.severity === 'error').map(e => `${e.file}:${e.line} ${e.message}`), [], Object.values(files).join('\n'));
  const d = elaborate(lib, top);
  assert.deepEqual(d.diags.filter(e => e.severity === 'error').map(e => e.message), []);
  return lib;
}
function imp(file, opts = {}) {
  const name = file.replace(/\.sch$/, '');
  const r = importIseSch(read(file), { name, ...opts });
  assert.deepEqual(r.warnings.filter(w => /^connectivity|schematic check/.test(w)), [], `${file}: ${r.warnings.join('\n')}`);
  return r;
}
// connectivity of the ISE netlist (block.pin grouped by signal) vs the XAIlinx netlist, through pinMap
function assertSameConnectivity(text, { doc, pinMap }) {
  const m = parseIseSch(text);
  const nl = netlist(doc);
  const netOf = new Map();
  for (const n of nl.nets) for (const e of n.endpoints) if (e.kind === 'pin') netOf.set(`${doc.symbols.find(s => s.id === e.sym).name}.${e.pin}`, n);
  const bySig = new Map();
  for (const b of m.blocks) for (const p of b.pins) {
    if (!p.signal) continue;
    const k = p.signal.toLowerCase();
    if (!bySig.has(k)) bySig.set(k, []);
    bySig.get(k).push(`${b.name}.${p.name}`);
  }
  const owner = new Map();
  for (const [sig, pins] of bySig) {
    const nets = new Set(pins.map(p => { const x = pinMap[p]; assert.ok(x, `pin ${p} mapped`); const n = netOf.get(x); assert.ok(n, `${p} -> ${x} is connected`); return n; }));
    assert.equal(nets.size, 1, `ISE net ${sig} is one XAIlinx net (${pins.join(', ')})`);
    const n = [...nets][0];
    assert.ok(!owner.has(n) || owner.get(n) === sig, `ISE nets ${owner.get(n)} and ${sig} stay apart`);
    owner.set(n, sig);
  }
  // I/O markers sit on the net of their signal
  for (const p of doc.ports) {
    const n = nl.portNet.get(p.id);
    const sig = owner.get(n);
    if (sig) assert.equal(sig.replace(/\(.*$/, ''), p.name.toLowerCase(), `port ${p.name}`);
  }
}
// net partition by symbol name / pin index (for round trips where hdl block pin names may change); bus helper
// symbols (slices, bus joins), whose names depend on the import order, are described by what they select
function partition(doc, modules) {
  const nl = netlist(doc, { modules });
  const groups = [];
  const desc = e => {
    if (e.kind === 'port') return `port:${doc.ports.find(p => p.id === e.port).name.toLowerCase()}`;
    const s = doc.symbols.find(q => q.id === e.sym);
    if (s.type === 'slice') return `slice[${s.params.msb}:${s.params.lsb}].${e.pin}`;
    if (s.type === 'busjoin') return `join[${s.params.widths}].${e.pin}`;
    return `${s.name.toLowerCase()}#${symbolDef(s, modules).pins.findIndex(p => p.name === e.pin)}`;
  };
  for (const n of nl.nets) {
    const g = n.endpoints.map(desc);
    if (g.length > 1) groups.push(g.sort().join(' '));
  }
  return groups.sort();
}

// ------------------------------------------------------------------ parsing
test('parseIseSch reads ISE 14 XML schematics (drawing version 7)', () => {
  const m = parseIseSch(read('MyAND2b4.sch'));
  assert.equal(m.version, 7);
  assert.equal(m.attrs.DeviceFamilyName, 'kintex7');
  assert.equal(m.signals.length, 15);
  assert.deepEqual(m.ports.map(p => `${p.polarity} ${p.name}`), ['Input A(3:0)', 'Input B(3:0)', 'Output C(3:0)']);
  assert.ok(m.blockdefs.has('and2'));
  assert.equal(m.blockdefs.get('and2').timestamp, '2000-1-1T10:10:10');
  assert.equal(m.blockdefs.get('and2').shapes.filter(s => s.kind === 'arc').length, 1);
  assert.equal(m.blocks.length, 4);
  assert.deepEqual(m.blocks[0].pins, [{ name: 'I0', signal: 'B(0)' }, { name: 'I1', signal: 'A(0)' }, { name: 'O', signal: 'C(0)' }]);
  const sh = m.sheets[0];
  assert.deepEqual([sh.width, sh.height], [1760, 1360]);
  assert.equal(sh.instances.length, 4);
  assert.deepEqual(sh.instances[0], { name: 'XLXI_1', x: 800, y: 544, orien: 'R0' });
  assert.equal(sh.bustaps.length, 12);
  assert.equal(sh.iomarkers.find(i => i.name === 'C(3:0)').orien, 'R0');
  assert.deepEqual(sh.branches.find(b => b.name === 'A(3)').labels.map(l => [l.x, l.y]), [[768, 896]]);
});

test('parseIseSch reads the legacy text format (VERSION 6)', () => {
  const m = parseIseSch(read('list1.sch'));
  assert.equal(m.version, 6);
  assert.deepEqual(m.ports.map(p => p.name).sort(), ['CLK', 'X1', 'X2', 'X3', 'Y']);
  assert.deepEqual(m.blocks.find(b => b.name === 'XLXI_2'), { name: 'XLXI_2', symbol: 'and3b1', attrs: {}, pins: [{ name: 'I0', signal: 'XLXN_64' }, { name: 'I1', signal: 'XLXN_62' }, { name: 'I2', signal: 'XLXN_58' }, { name: 'O', signal: 'XLXN_10' }] });
  const c = parseIseSch(read('Counter_2b.sch'));
  assert.equal(c.sheets[0].bustaps.length, 2);
  assert.equal(c.blocks.find(b => b.name === 'I_Q0').pins.find(p => p.name === 'T').signal, 'XLXN_1');
  // same model as the XML form: arcs become centre/radius/start/end
  const or2 = m.blockdefs.get('or3').shapes.find(s => s.kind === 'arc');
  assert.ok(or2.r > 0);
});

test('orientation helpers: ISE Rk/Mk <-> XAIlinx rot/mirror', () => {
  assert.deepEqual(iseXform('R90', 0, -64), [64, 0]);
  assert.deepEqual(iseXform('M180', 256, -96), [256, 96]);
  for (const o of ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270']) {
    const x = iseOrienToXai(o);
    assert.equal(xaiToIseOrien(x.rot, x.mirror), o);
  }
  // library pins checked against ISE files
  assert.deepEqual(libPins('and2'), { I0: ['in', 0, -64], I1: ['in', 0, -128], O: ['out', 256, -96] });
  assert.deepEqual(libPins('fdce').Q, ['out', 384, -256]);
  assert.deepEqual(libPins('m2_1').S0, ['in', 0, -32]);
});

test('parseXml tolerates comments, CDATA, entities and unclosed tags', () => {
  const r = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b/><c>t&lt;x<![CDATA[<raw>]]></c><d></a>');
  const a = r.children[0];
  assert.equal(a.attrs.x, '1 & 2');
  assert.equal(a.children[1].text, 't<x<raw>');
});

// ------------------------------------------------------------------ import
test('import: bus taps become slices / a bus join, gates keep their nets (MyAND2b4)', () => {
  const r = imp('MyAND2b4.sch');
  const { doc } = r;
  const t = doc.symbols.map(s => s.type);
  assert.equal(t.filter(x => x === 'and2').length, 4);
  assert.equal(t.filter(x => x === 'slice').length, 8);
  assert.equal(t.filter(x => x === 'busjoin').length, 1);
  assert.deepEqual(doc.ports.map(p => `${p.name}:${p.dir}:${p.width}`).sort(), ['A:in:4', 'B:in:4', 'C:out:4']);
  assert.ok(doc.symbols.find(s => s.name === 'XLXI_1'));
  assertSameConnectivity(read('MyAND2b4.sch'), r);
  const nl = netlist(doc);
  assert.deepEqual(nl.diagnostics.filter(d => d.severity === 'error'), []);
  // the drawing keeps the ISE layout: the gates are stacked like in ISE
  const ys = ['XLXI_1', 'XLXI_2', 'XLXI_3', 'XLXI_4'].map(n => doc.symbols.find(s => s.name === n).y);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2] && ys[2] < ys[3]);
});

test('import: all fixtures keep the ISE connectivity', () => {
  for (const f of FIXTURES) assertSameConnectivity(read(f), imp(f));
});

test('import: inverted-input gates become the native ANDnBk symbols, FD stays FD (list1, VERSION 6)', () => {
  const { doc, pinMap } = imp('list1.sch');
  const t = doc.symbols.map(s => s.type);
  assert.equal(t.filter(x => x === 'fd').length, 4);
  assert.equal(t.filter(x => x === 'inv').length, 0);
  assert.deepEqual(t.filter(x => /^(and|or)/.test(x)).sort(), ['and2b2', 'and3b1', 'and3b2', 'or3']);
  // same pin names as ISE (I0 inverted, at the bottom)
  assert.equal(pinMap['XLXI_2.I0'], 'XLXI_2.I0');
  assert.equal(pinMap['XLXI_2.I2'], 'XLXI_2.I2');
  assert.deepEqual(doc.ports.map(p => `${p.name}:${p.dir}`).sort(), ['CLK:in', 'X1:in', 'X2:in', 'X3:in', 'Y:out']);
});

test('import: library symbols without a XAIlinx twin get exact HDL (ftce), unknown ones a placeholder', () => {
  const { doc, warnings } = imp('Counter_2b.sch');
  const blocks = doc.symbols.filter(s => s.type === 'hdlblock');
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every(b => /rising_edge/.test(b.hdl)));
  assert.equal(warnings.filter(w => /no XAIlinx equivalent/.test(w)).length, 0);
  // an unknown symbol with a project module of that name becomes a module symbol
  const sch = read('MyAND2b4.sch').replace(/symbolname="and2"/g, 'symbolname="myand"');
  const mod = { myand: { name: 'myand', ports: [{ name: 'I0', dir: 'in', width: 1 }, { name: 'I1', dir: 'in', width: 1 }, { name: 'O', dir: 'out', width: 1 }] } };
  const r = importIseSch(sch, { name: 'm', modules: mod });
  assert.equal(r.doc.symbols.filter(s => s.type === 'module' && s.params.module === 'myand').length, 4);
  assert.deepEqual(r.warnings.filter(w => /connectivity/.test(w)), []);
  // ... and without it an empty HDL block with the right pins plus a warning
  const u = importIseSch(sch, { name: 'm' });
  const hb = u.doc.symbols.filter(s => s.type === 'hdlblock');
  assert.equal(hb.length, 4);
  assert.deepEqual(hb[0].params.inputs.length + hb[0].params.outputs.length, 3);
  assert.ok(u.warnings.some(w => /'myand' has no XAIlinx equivalent/.test(w)));
});

for (const lang of ['vhdl', 'verilog']) {
  test(`import -> generateHdl (${lang}) compiles and elaborates for every fixture`, () => {
    for (const f of FIXTURES) {
      const { doc } = imp(f, { lang });
      const g = generateHdl(doc, { lang });
      assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], `${f}\n${g.code}`);
      compiles({ [g.filename]: g.code }, doc.name);
    }
  });
}

// ------------------------------------------------------------------ function preserved: simulate against hand-written references
const TB_LIST1 = {
  vhdl: `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal CLK : std_logic := '0'; signal X1, X2, X3 : std_logic := '0'; signal Y : std_logic;
  signal q1, q2, q3, yr : std_logic := '0';
  signal cnt : unsigned(7 downto 0) := (others => '0');
  signal errs : integer := 0;
begin
  dut : entity work.list1 port map (CLK => CLK, X1 => X1, X2 => X2, X3 => X3, Y => Y);
  -- reference: the ISE drawing, written by hand
  ref : process (CLK) begin
    if rising_edge(CLK) then
      q1 <= X1; q2 <= X2; q3 <= X3;
      yr <= ((not q2) and (not q1)) or ((not q3) and q2 and q1) or ((not q3) and (not q1) and q2);
    end if;
  end process;
  process begin
    for i in 0 to 60 loop
      cnt <= to_unsigned((i * 37 + 11) mod 256, 8);
      wait for 1 ns;
      X1 <= cnt(0); X2 <= cnt(3); X3 <= cnt(5);
      wait for 4 ns; CLK <= '1'; wait for 5 ns; CLK <= '0';
      if i > 2 and Y /= yr then errs <= errs + 1; end if;
    end loop;
    wait for 1 ns;
    report "errs=" & integer'image(errs);
    wait;
  end process;
end;`,
  verilog: `
\`timescale 1ns/1ps
module tb;
  reg CLK = 0, X1 = 0, X2 = 0, X3 = 0; wire Y;
  reg q1 = 0, q2 = 0, q3 = 0, yr = 0; integer i, errs = 0; reg [7:0] cnt;
  list1 dut (.CLK(CLK), .X1(X1), .X2(X2), .X3(X3), .Y(Y));
  always @(posedge CLK) begin q1 <= X1; q2 <= X2; q3 <= X3; yr <= (~q2 & ~q1) | (~q3 & q2 & q1) | (~q3 & ~q1 & q2); end
  initial begin
    for (i = 0; i <= 60; i = i + 1) begin
      cnt = (i * 37 + 11) % 256; #1 X1 = cnt[0]; X2 = cnt[3]; X3 = cnt[5];
      #4 CLK = 1; #5 CLK = 0;
      if (i > 2 && Y !== yr) errs = errs + 1;
    end
    $display("errs=%0d", errs);
  end
endmodule`,
};
for (const lang of ['vhdl', 'verilog']) {
  test(`simulation (${lang}): FD + inverted-input gates (list1) match the hand-written reference`, () => {
    const { doc } = imp('list1.sch', { lang });
    const g = generateHdl(doc, { lang });
    const r = runSim({ [g.filename]: g.code, [lang === 'vhdl' ? 'tb.vhd' : 'tb.v']: TB_LIST1[lang] }, 'tb', 1e7);
    assert.ok(logOf(r).includes('errs=0'), logOf(r).join('\n') + '\n' + g.code);
    const y = r.design.top.signals.find(s => s.name === 'Y') || r.design.top.ports?.find(p => p.name === 'Y')?.sig;
    void y;
  });
}

test('simulation: 4-bit AND with bus taps (MyAND2b4) and 4:1 bus multiplexer (Mux4to1b4)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const a = imp('MyAND2b4.sch', { lang }), m = imp('Mux4to1b4.sch', { lang });
    const ga = generateHdl(a.doc, { lang }), gm = generateHdl(m.doc, { lang });
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal A, B, C, I0, I1, I2, I3, o : std_logic_vector(3 downto 0); signal sel : std_logic_vector(1 downto 0);
begin
  u1 : entity work.MyAND2b4 port map (A => A, B => B, C => C);
  u2 : entity work.Mux4to1b4 port map (s => sel, I0 => I0, I1 => I1, I2 => I2, I3 => I3, o => o);
  process
    variable errs : integer := 0;
    type arr is array (0 to 3) of std_logic_vector(3 downto 0);
    variable d : arr;
  begin
    for i in 0 to 255 loop
      A <= std_logic_vector(to_unsigned(i mod 16, 4)); B <= std_logic_vector(to_unsigned(i / 16, 4));
      d := (std_logic_vector(to_unsigned(i mod 16, 4)), std_logic_vector(to_unsigned((i * 7) mod 16, 4)), std_logic_vector(to_unsigned((i * 11 + 3) mod 16, 4)), std_logic_vector(to_unsigned(15 - (i mod 16), 4)));
      I0 <= d(0); I1 <= d(1); I2 <= d(2); I3 <= d(3); sel <= std_logic_vector(to_unsigned(i mod 4, 2));
      wait for 5 ns;
      if C /= (A and B) then errs := errs + 1; end if;
      if o /= d(i mod 4) then errs := errs + 1; end if;
    end loop;
    report "errs=" & integer'image(errs);
    wait;
  end process;
end;` : `
module tb;
  reg [3:0] A, B, I0, I1, I2, I3; reg [1:0] sel; wire [3:0] C, o; integer i, errs = 0; reg [3:0] d [0:3];
  MyAND2b4 u1 (.A(A), .B(B), .C(C));
  Mux4to1b4 u2 (.s(sel), .I0(I0), .I1(I1), .I2(I2), .I3(I3), .o(o));
  initial begin
    for (i = 0; i < 256; i = i + 1) begin
      A = i % 16; B = i / 16;
      d[0] = i % 16; d[1] = (i * 7) % 16; d[2] = (i * 11 + 3) % 16; d[3] = 15 - (i % 16);
      I0 = d[0]; I1 = d[1]; I2 = d[2]; I3 = d[3]; sel = i % 4;
      #5;
      if (C !== (A & B)) errs = errs + 1;
      if (o !== d[i % 4]) errs = errs + 1;
    end
    $display("errs=%0d", errs);
  end
endmodule`;
    const r = runSim({ [ga.filename]: ga.code, [gm.filename]: gm.code, [lang === 'vhdl' ? 'tb.vhd' : 'tb.v']: tb }, 'tb', 1e7);
    assert.ok(logOf(r).includes('errs=0'), lang + '\n' + logOf(r).join('\n'));
  }
});

test('simulation: FTCE toggle flip-flop counter (Counter_2b) counts like a 2-bit counter', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const { doc } = imp('Counter_2b.sch', { lang });
    const g = generateHdl(doc, { lang });
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal CLK, CE, CLR : std_logic := '0'; signal T_ID : std_logic_vector(1 downto 0); signal ref : unsigned(1 downto 0) := "00";
begin
  dut : entity work.Counter_2b port map (CE => CE, CLK => CLK, CLR => CLR, T_ID => T_ID);
  process
    variable errs : integer := 0;
  begin
    for i in 0 to 40 loop
      CE <= '1' when (i mod 5) /= 3 else '0';
      CLR <= '1' when i = 17 else '0';
      wait for 2 ns;
      if CLR = '1' then ref <= "00"; end if;
      wait for 3 ns; CLK <= '1';
      if CLR = '0' and CE = '1' then ref <= ref + 1; end if;
      wait for 5 ns; CLK <= '0';
      if T_ID /= std_logic_vector(ref) then errs := errs + 1; end if;
    end loop;
    report "errs=" & integer'image(errs) & " last=" & integer'image(to_integer(ref));
    wait;
  end process;
end;` : `
\`timescale 1ns/1ps
module tb;
  reg CLK = 0, CE = 0, CLR = 0; wire [1:0] T_ID; reg [1:0] ref = 0; integer i, errs = 0;
  Counter_2b dut (.CE(CE), .CLK(CLK), .CLR(CLR), .T_ID(T_ID));
  initial begin
    for (i = 0; i <= 40; i = i + 1) begin
      CE = (i % 5) != 3; CLR = i == 17;
      #2 if (CLR) ref = 0;
      #3 CLK = 1; if (!CLR && CE) ref = ref + 1;
      #5 CLK = 0;
      if (T_ID !== ref) errs = errs + 1;
    end
    $display("errs=%0d last=%0d", errs, ref);
  end
endmodule`;
    const r = runSim({ [g.filename]: g.code, [lang === 'vhdl' ? 'tb.vhd' : 'tb.v']: tb }, 'tb', 1e7);
    assert.ok(logOf(r).some(l => /^errs=0 last=\d/.test(l)), lang + '\n' + logOf(r).join('\n') + '\n' + g.code);
  }
});

// ------------------------------------------------------------------ export
// ISE geometry of an exported schematic: every connected block pin and I/O marker touches a wire of its net
function assertIseGeometry(xml, files) {
  const m = parseIseSch(xml);
  const syms = new Map(files.filter(f => f.kind === 'sym').map(f => { const s = parseIseSym(f.text); return [s.name.toLowerCase(), s]; }));
  const sh = m.sheets[0];
  const on = (x, y, sig) => sh.branches.some(b => b.name === sig && b.wires.some(([x1, y1, x2, y2]) => (x1 === x2 ? x === x1 && y >= Math.min(y1, y2) && y <= Math.max(y1, y2) : y === y1 && x >= Math.min(x1, x2) && x <= Math.max(x1, x2))));
  for (const b of m.blocks) {
    const inst = sh.instances.find(i => i.name === b.name);
    assert.ok(inst, `instance ${b.name}`);
    const lib = libPins(b.symbol);
    const sym = syms.get(b.symbol.toLowerCase());
    for (const p of b.pins) {
      if (!p.signal) continue;
      const l = sym ? sym.pins.find(q => q.name === p.name) : { x: lib[p.name][1], y: lib[p.name][2] };
      assert.ok(l, `${b.symbol}.${p.name} position`);
      const [dx, dy] = iseXform(inst.orien, l.x, l.y);
      const x = inst.x + dx, y = inst.y + dy;
      const touchesPin = m.blocks.some(o => o !== b && o.pins.some(q => q.signal === p.signal));
      assert.ok(on(x, y, p.signal) || touchesPin, `${b.name}.${p.name} (${b.symbol}) at ${x},${y} on ${p.signal}`);
    }
  }
  for (const io of sh.iomarkers) assert.ok(on(io.x, io.y, io.name) || m.blocks.some(b => b.pins.some(p => p.signal === io.name)), `iomarker ${io.name}`);
}

test('export: well-formed ISE 14.7 XML with netlist, library blockdefs and sheet', () => {
  const { doc } = imp('list1.sch');
  const { xml, files, warnings } = exportIseSch(doc, { timestamp: '2024-1-2T3:4:5' });
  const root = parseXml(xml);
  const dr = root.children.find(c => c.tag === 'drawing');
  assert.equal(dr.attrs.version, '7');
  assert.ok(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<drawing version="7">/.test(xml));
  assert.equal(dr.children[0].tag, 'attr');
  assert.equal(dr.children[0].attrs.name, 'DeviceFamilyName');
  assert.equal(dr.children[0].attrs.value, 'spartan3e');
  assert.deepEqual(dr.children.map(c => c.tag), ['attr', 'netlist', 'sheet']);
  const nlx = dr.children[1];
  const tags = new Set(nlx.children.map(c => c.tag));
  for (const t of ['signal', 'port', 'blockdef', 'block']) assert.ok(tags.has(t), t);
  const defs = nlx.children.filter(c => c.tag === 'blockdef').map(c => c.attrs.name).sort();
  assert.deepEqual(defs, ['and2b2', 'and3b1', 'and3b2', 'fd', 'or3']);
  // ISE library graphics of the inverted-input gates: bubbles on the inverted inputs
  const b2 = nlx.children.find(c => c.tag === 'blockdef' && c.attrs.name === 'and3b2');
  assert.equal(b2.children.filter(c => c.tag === 'circle').length, 2);
  for (const d of nlx.children.filter(c => c.tag === 'blockdef')) assert.equal(d.children[0].tag, 'timestamp');
  // library pin names
  const fd = nlx.children.find(c => c.tag === 'block' && c.attrs.symbolname === 'fd');
  assert.deepEqual(fd.children.map(c => c.attrs.name).sort(), ['C', 'D', 'Q']);
  const and3 = nlx.children.find(c => c.tag === 'block' && c.attrs.symbolname === 'and3b1');
  assert.deepEqual(and3.children.map(c => c.attrs.name).sort(), ['I0', 'I1', 'I2', 'O']);
  assert.deepEqual(nlx.children.filter(c => c.tag === 'port').map(p => `${p.attrs.polarity} ${p.attrs.name}`).sort(), ['Input CLK', 'Input X1', 'Input X2', 'Input X3', 'Output Y']);
  const sheet = dr.children[2];
  assert.equal(sheet.attrs.sheetnum, '1');
  assert.ok(['1760', '2720', '3520', '5440', '7040'].includes(sheet.attrs.width));
  assert.equal(sheet.children.filter(c => c.tag === 'instance').length, nlx.children.filter(c => c.tag === 'block').length);
  assert.equal(sheet.children.filter(c => c.tag === 'iomarker').length, 5);
  assert.ok(sheet.children.every(c => ['instance', 'branch', 'iomarker'].includes(c.tag)));
  assert.equal(files.length, 0, 'library symbols only: no extra files');
  assert.deepEqual(warnings, []);
  assertIseGeometry(xml, files);
});

test('export -> import round trip preserves the connectivity of every fixture', () => {
  for (const f of FIXTURES) {
    const a = imp(f);
    const ex = exportIseSch(a.doc, {});
    parseXml(ex.xml);
    assertIseGeometry(ex.xml, ex.files);
    const symbols = Object.fromEntries(ex.files.filter(x => x.kind === 'sym').map(x => [x.path, x.text]));
    const b = importIseSch(ex.xml, { name: a.doc.name, symbols });
    assert.deepEqual(b.warnings.filter(w => /^connectivity/.test(w)), [], f);
    assert.deepEqual(partition(b.doc), partition(a.doc), f);
  }
});

// a drawn XAIlinx schematic with symbols ISE does not have: bus gates, adder, register, constant, slice, bus join, HDL block
function nativeDoc(lang) {
  const doc = newDoc('accu', lang);
  let wid = 0;
  const sym = (type, x, y, params = {}, name, extra = {}) => { const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `U${doc.symbols.length + 1}`, params, ...extra }; doc.symbols.push(s); return s; };
  const pin = (s, n) => { const p = symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]).find(q => q.name === n); return { x: p.x, y: p.y }; };
  const wire = (...pts) => doc.wires.push({ id: `W${++wid}`, points: pts });
  const conn = (a, b, mx = Math.round((a.x + b.x) / 20) * 10) => (a.y === b.y || a.x === b.x ? wire(a, b) : wire(a, { x: mx, y: a.y }, { x: mx, y: b.y }, b));
  const port = (name, dir, x, y, width = 1) => doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width, x, y });
  // q <= q + d (8 bit) when en, async reset; lo = q(3:0) and m(3:0); hi = {q(7:4), "1010"} ; par = xor of q(1:0) via HDL block
  const add = sym('add', 300, 100, { width: 8 }, 'ADD1');
  const reg = sym('register', 500, 100, { width: 8, en: true, reset: 'async', init: '0' }, 'REG1');
  const sl = sym('slice', 700, 300, { msb: 3, lsb: 0 }, 'SL1');
  const sh = sym('slice', 700, 400, { msb: 7, lsb: 4 }, 'SL2');
  const g = sym('and2', 820, 290, { width: 4 }, 'G1');
  const k = sym('constant', 700, 470, { value: '0xA', width: 4 }, 'K1');
  const j = sym('busjoin', 900, 400, { widths: '4,4' }, 'J1');
  const sp = sym('slice', 700, 560, { msb: 1, lsb: 0 }, 'SL3');
  const hb = sym('hdlblock', 820, 540, { title: 'par', inputs: [{ name: 'v', width: 2 }], outputs: [{ name: 'p', width: 1 }] }, 'HB1', { hdl: lang === 'vhdl' ? 'p <= v(0) xor v(1);' : 'assign p = v[0] ^ v[1];' });
  const f = sym('fdc', 1000, 600, {}, 'FF1');
  port('d', 'in', 100, 130, 8); port('clk', 'in', 100, 300, 1); port('rst', 'in', 100, 340, 1); port('en', 'in', 100, 380, 1); port('m', 'in', 100, 460, 4);
  port('q', 'out', 1300, 110, 8); port('lo', 'out', 1300, 300, 4); port('hi', 'out', 1300, 410, 8); port('par', 'out', 1300, 610, 1);
  conn({ x: 100, y: 130 }, pin(add, 'B'));
  conn(pin(add, 'S'), pin(reg, 'D'));
  conn({ x: 100, y: 380 }, pin(reg, 'CE'), 460);
  conn({ x: 100, y: 300 }, pin(reg, 'C'), 440);
  conn({ x: 100, y: 340 }, pin(reg, 'CLR'), 420);
  const Q = pin(reg, 'Q');
  wire(Q, { x: 1300, y: 110 });
  const A = pin(add, 'A');
  wire({ x: A.x - 30, y: A.y }, A); doc.labels.push({ id: 'L1', x: A.x - 30, y: A.y, net: 'q' });
  for (const s of [sl, sh, sp]) { const I = pin(s, 'I'); wire({ x: I.x - 30, y: I.y }, I); doc.labels.push({ id: `L${doc.labels.length + 1}`, x: I.x - 30, y: I.y, net: 'q' }); }
  conn(pin(sl, 'O'), pin(g, 'I0'));
  const I1 = pin(g, 'I1'); wire({ x: I1.x - 20, y: I1.y }, I1); doc.labels.push({ id: 'L9', x: I1.x - 20, y: I1.y, net: 'm(3:0)' });
  wire({ x: 100, y: 460 }, { x: 140, y: 460 }); doc.labels.push({ id: 'L10', x: 140, y: 460, net: 'm(3:0)' });
  conn(pin(g, 'O'), { x: 1300, y: 300 });
  conn(pin(sh, 'O'), pin(j, 'I0'));
  conn(pin(k, 'O'), pin(j, 'I1'));
  conn(pin(j, 'O'), { x: 1300, y: 410 });
  conn(pin(sp, 'O'), pin(hb, 'v'));
  conn(pin(hb, 'p'), pin(f, 'D'));
  const FC = pin(f, 'C'); wire({ x: FC.x - 20, y: FC.y }, FC); doc.labels.push({ id: 'L11', x: FC.x - 20, y: FC.y, net: 'clk' });
  const FR = pin(f, 'CLR'); wire({ x: FR.x - 20, y: FR.y }, FR); doc.labels.push({ id: 'L12', x: FR.x - 20, y: FR.y, net: 'rst' });
  conn(pin(f, 'Q'), { x: 1300, y: 610 });
  return doc;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`export (${lang}): XAIlinx-only symbols get custom blockdefs + HDL modules + symbols; ISE round trip simulates like the original`, () => {
    const doc = normalizeDoc(nativeDoc(lang));
    const g0 = generateHdl(doc, { lang });
    assert.deepEqual(g0.diagnostics.filter(d => d.severity !== 'info').map(d => d.message), [], g0.code);
    const ex = exportIseSch(doc, { family: 'spartan3e', timestamp: '2024-1-2T3:4:5' });
    assertIseGeometry(ex.xml, ex.files);
    const m = parseIseSch(ex.xml);
    const used = [...new Set(m.blocks.map(b => b.symbol))].sort();
    assert.deepEqual(used, ['fdc', 'fd8ce', 'xl_add8', 'xl_and2_w4', 'xl_const4_ha', 'xl_hdl_par', 'xl_join_4_4'].sort());
    assert.ok(m.signals.some(s => s.name === 'd(7:0)') && m.signals.some(s => s.name === 'q(7:0)'), 'bus signals use ISE ranges');
    // slices are ISE bus taps on renamed part nets; the bus join is not (its input q(7:4) is already a part of q)
    assert.equal(m.sheets[0].bustaps.length, 3);
    for (const n of ['q(3:0)', 'q(7:4)', 'q(1:0)']) assert.ok(m.signals.some(s => s.name === n), n);
    assert.deepEqual(m.ports.map(p => `${p.polarity} ${p.name}`).sort(), ['Input clk', 'Input d(7:0)', 'Input en', 'Input m(3:0)', 'Input rst', 'Output hi(7:0)', 'Output lo(3:0)', 'Output par', 'Output q(7:0)']);
    // register 8 bit with CE and async clear is the library FD8CE (pins C CE CLR D(7:0) Q(7:0))
    assert.deepEqual(m.blocks.find(b => b.symbol === 'fd8ce').pins.map(p => p.name).sort(), ['C', 'CE', 'CLR', 'D(7:0)', 'Q(7:0)']);
    // custom symbols: an HDL module and an ISE symbol each
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const customs = used.filter(n => n.startsWith('xl_'));
    for (const c of customs) {
      assert.ok(ex.files.some(f => f.path === `${c}.${ext}`), `${c}.${ext}`);
      const sym = parseIseSym(ex.files.find(f => f.path === `${c}.sym`).text);
      assert.equal(sym.name, c);
      assert.deepEqual(sym.pins.map(p => p.name).sort(), m.blocks.find(b => b.symbol === c).pins.map(p => p.name).sort());
    }
    assert.ok(ex.warnings.some(w => /not in the Xilinx library/.test(w)));
    assert.deepEqual(decodeXlSymbol('xl_add8'), { type: 'add', params: { width: 8, cin: false, cout: false } });
    // the HDL modules compile
    const hdlFiles = Object.fromEntries(ex.files.filter(f => f.kind === 'hdl').map(f => [f.path, f.text]));
    compile(Object.entries(hdlFiles).map(([path, text]) => ({ path, text })));
    // re-import (as ISE would hand it back): xl_* symbols decode to XAIlinx symbols, the HDL block becomes a module
    const lib = compile(Object.entries(hdlFiles).map(([path, text]) => ({ path, text })));
    assert.deepEqual(lib.errors.filter(e => e.severity === 'error').map(e => e.message), []);
    const modules = modulesFromLibrary(lib, { sources: hdlFiles });
    const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
    const back = importIseSch(ex.xml, { name: 'accu', lang, modules, symbols });
    assert.deepEqual(back.warnings.filter(w => /^connectivity|schematic check/.test(w)), []);
    const types = back.doc.symbols.map(s => s.type).sort();
    assert.deepEqual(types, ['add', 'and2', 'busjoin', 'constant', 'fdc', 'module', 'register', 'slice', 'slice', 'slice'].sort());
    const g1 = generateHdl(back.doc, { lang, modules });
    assert.deepEqual(g1.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], g1.code);
    // simulate the original and the round-tripped design with the same testbench
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal clk, rst, en : std_logic := '0'; signal d, q, hi : std_logic_vector(7 downto 0) := (others => '0');
  signal m, lo : std_logic_vector(3 downto 0) := "0110"; signal par : std_logic;
begin
  clk <= not clk after 5 ns;
  dut : entity work.accu port map (d => d, clk => clk, rst => rst, en => en, m => m, q => q, lo => lo, hi => hi, par => par);
  process begin
    rst <= '1'; wait for 12 ns; rst <= '0'; en <= '1';
    for i in 1 to 30 loop
      d <= std_logic_vector(to_unsigned((i * 29) mod 256, 8)); m <= std_logic_vector(to_unsigned(i mod 16, 4));
      if i mod 7 = 0 then en <= '0'; else en <= '1'; end if;
      wait until falling_edge(clk);
      report "q=" & integer'image(to_integer(unsigned(q))) & " lo=" & integer'image(to_integer(unsigned(lo))) & " hi=" & integer'image(to_integer(unsigned(hi))) & " par=" & std_logic'image(par);
    end loop;
    wait;
  end process;
end;` : `
\`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1, en = 0; reg [7:0] d = 0; reg [3:0] m = 4'b0110; wire [7:0] q, hi; wire [3:0] lo; wire par; integer i;
  accu dut (.d(d), .clk(clk), .rst(rst), .en(en), .m(m), .q(q), .lo(lo), .hi(hi), .par(par));
  always #5 clk = ~clk;
  initial begin
    #12 rst = 0; en = 1;
    for (i = 1; i <= 30; i = i + 1) begin
      d = (i * 29) % 256; m = i % 16; en = (i % 7) != 0;
      @(negedge clk);
      $display("q=%0d lo=%0d hi=%0d par=%b", q, lo, hi, par);
    end
  end
endmodule`;
    const tbf = lang === 'vhdl' ? 'tb.vhd' : 'tb.v';
    const a = runSim({ [g0.filename]: g0.code, [tbf]: tb }, 'tb', 1e6);
    const b = runSim({ ...hdlFiles, [g1.filename]: g1.code, [tbf]: tb }, 'tb', 1e6);
    const la = logOf(a).filter(l => /^q=/.test(l)), lb = logOf(b).filter(l => /^q=/.test(l));
    assert.equal(la.length, 30);
    assert.ok(new Set(la).size > 10, 'testbench produces activity');
    assert.deepEqual(lb, la);
  });
}

test('export: library gate geometry lines up exactly (no stub wires) and symbol orientation survives', () => {
  const doc = newDoc('g', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} });
  doc.symbols.push({ id: 'S2', type: 'inv', x: 400, y: 300, rot: 90, mirror: false, name: 'U2', params: {} });
  doc.symbols.push({ id: 'S3', type: 'mux2', x: 600, y: 100, rot: 0, mirror: true, name: 'U3', params: {} });
  const n = normalizeDoc(doc);
  const P = s => symbolPins(n.symbols.find(q => q.name === s));
  const [i0, i1, o] = P('U1');
  n.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: i0.x - 40, y: i0.y }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: i1.x - 40, y: i1.y });
  n.wires.push({ id: 'W1', points: [{ x: i0.x - 40, y: i0.y }, { x: i0.x, y: i0.y }] }, { id: 'W2', points: [{ x: i1.x - 40, y: i1.y }, { x: i1.x, y: i1.y }] });
  const inv = P('U2');
  n.wires.push({ id: 'W3', points: [{ x: o.x, y: o.y }, { x: inv[0].x, y: o.y }, { x: inv[0].x, y: inv[0].y }] });
  n.ports.push({ id: 'P3', name: 'y', dir: 'out', width: 1, x: inv[1].x, y: inv[1].y + 40 });
  n.wires.push({ id: 'W4', points: [{ x: inv[1].x, y: inv[1].y }, { x: inv[1].x, y: inv[1].y + 40 }] });
  const { xml, files } = exportIseSch(n, {});
  const m = parseIseSch(xml);
  assert.equal(m.sheets[0].instances.find(i => i.name === 'U2').orien, 'R90');
  assert.equal(m.sheets[0].instances.find(i => i.name === 'U3').orien, 'M0');
  assertIseGeometry(xml, files);
  // and2: the ISE pins are exactly the XAIlinx pins (scaled); INV is 224 units long in ISE (70 px, XAIlinx 60):
  // its output gets one stub wire, nothing else is added to the 5 drawn wire segments
  const wires = m.sheets[0].branches.flatMap(b => b.wires);
  assert.equal(wires.length, 6);
  const and2 = m.sheets[0].instances.find(i => i.name === 'U1');
  assert.deepEqual([and2.x + 0, and2.y - 64], [Math.round(i1.x * 3.2), Math.round(i1.y * 3.2)]);
  const back = importIseSch(xml, { name: 'g' });
  assert.deepEqual(partition(back.doc), partition(n));
  assert.equal(back.doc.symbols.find(s => s.name === 'U2').rot, 90);
  assert.equal(back.doc.symbols.find(s => s.name === 'U3').mirror, true);
});

test('convertIseSchematics: hierarchical ISE project (a schematic used as a symbol) converts bottom-up and simulates', () => {
  // parent drawn in XAIlinx around the MyAND2b4 module, written as an ISE schematic
  const child = imp('MyAND2b4.sch');
  const gc = generateHdl(child.doc, { lang: 'vhdl' });
  const modules = modulesFromLibrary(compile([{ path: 'MyAND2b4.vhd', text: gc.code }]), { sources: { 'MyAND2b4.vhd': gc.code } });
  const top = newDoc('top', 'vhdl');
  top.symbols.push({ id: 'S1', type: 'module', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: { module: 'MyAND2b4', generics: {} } });
  const pins = symbolPins(normalizeDoc(top).symbols[0], modules);
  for (const p of pins) {
    const dir = p.dir === 'out' ? 'out' : 'in';
    const x = dir === 'in' ? p.x - 60 : p.x + 60;
    top.ports.push({ id: `P${top.ports.length + 1}`, name: `${p.name.toLowerCase()}x`, dir, width: 4, x, y: p.y });
    top.wires.push({ id: `W${top.wires.length + 1}`, points: [{ x, y: p.y }, { x: p.x, y: p.y }] });
  }
  const ex = exportIseSch(top, { modules });
  assert.ok(ex.files.some(f => f.path === 'MyAND2b4.sym'), 'symbol for the sub-schematic');
  assert.ok(!ex.files.some(f => f.kind === 'hdl'), 'no HDL for project modules');
  const res = convertIseSchematics({ 'src/top.sch': ex.xml, 'src/MyAND2b4.sch': read('MyAND2b4.sch') }, { lang: 'vhdl', symbols: { 'MyAND2b4.sym': ex.files[0].text } });
  assert.deepEqual(res.map(r => r.sch), ['src/MyAND2b4.sch', 'src/top.sch']);
  assert.deepEqual(res.map(r => [r.json, r.hdl]), [['src/MyAND2b4.sch.json', 'src/MyAND2b4.vhd'], ['src/top.sch.json', 'src/top.vhd']]);
  for (const r of res) assert.deepEqual(r.warnings.filter(w => /connectivity|HDL generation/.test(w)), [], r.sch);
  const t = res[1].doc;
  assert.equal(t.generatedFile, 'src/top.vhd');
  assert.ok(t.symbols.some(s => s.type === 'module' && s.params.module.toLowerCase() === 'myand2b4'));
  const tb = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is signal a, b, c : std_logic_vector(3 downto 0); begin
  dut : entity work.top port map (ax => a, bx => b, cx => c);
  process variable errs : integer := 0; begin
    for i in 0 to 255 loop a <= std_logic_vector(to_unsigned(i mod 16, 4)); b <= std_logic_vector(to_unsigned(i / 16, 4)); wait for 1 ns;
      if c /= (a and b) then errs := errs + 1; end if; end loop;
    report "errs=" & integer'image(errs); wait;
  end process;
end;`;
  const r = runSim({ [res[0].hdl]: res[0].code, [res[1].hdl]: res[1].code, 'tb.vhd': tb }, 'tb', 1e6);
  assert.ok(logOf(r).includes('errs=0'), logOf(r).join('\n') + res[1].code);
});

// ------------------------------------------------------------------ inverted-input gates, decoders, encoders, demultiplexers
function libDoc() {
  const doc = newDoc('newlib', 'vhdl');
  const parts = [
    ['and3b2', {}], ['nor2b1', {}], ['or2b1', { width: 4 }], ['decoder', { n: 2, en: true, bus: false }], ['decoder', { n: 3, en: true, bus: false }],
    ['decoder', { n: 4, en: true, bus: false }], ['decoder', { n: 3, en: false, bus: true }], ['encoder', { n: 3, mode: 'priority', bus: true }],
    ['encoder', { n: 2, mode: 'one-hot', bus: false }], ['demux', { sel: 2, width: 4 }],
  ];
  let x = 200, y = 100;
  parts.forEach(([type, params], k) => {
    const s = { id: `S${k + 1}`, type, x, y, rot: 0, mirror: false, name: `U${k + 1}`, params };
    doc.symbols.push(s);
    const def = symbolDef(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]);
    for (const p of symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0])) {
      const [dx, dy] = { W: [-40, 0], E: [40, 0], S: [0, 40], N: [0, -40] }[p.side];
      const e = { x: p.x + dx, y: p.y + dy };
      doc.wires.push({ id: `W${doc.wires.length + 1}`, points: [{ x: p.x, y: p.y }, e] });
      doc.ports.push({ id: `P${doc.ports.length + 1}`, name: `${s.name}_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: p.width || 1, x: e.x, y: e.y });
    }
    y += def.h + 80;
    if (y > 900) { y = 100; x += 400; }
  });
  return normalizeDoc(doc);
}

test('export: ANDnBk / D2_4E / D3_8E become Xilinx library symbols, the others xl_* symbols; ISE round trip keeps types and nets', () => {
  const doc = libDoc();
  assert.deepEqual(netlist(doc).diagnostics.filter(d => d.severity === 'error'), []);
  const ex = exportIseSch(doc, { timestamp: '2024-1-2T3:4:5' });
  assertIseGeometry(ex.xml, ex.files);
  const m = parseIseSch(ex.xml);
  const sym = n => m.blocks.find(b => b.name === n).symbol;
  assert.deepEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10'].map(sym),
    ['and3b2', 'nor2b1', 'xl_or2b1_w4', 'd2_4e', 'd3_8e', 'xl_dec4_e', 'xl_dec3_bus', 'xl_penc3_bus', 'xl_enc2', 'xl_demux2_w4']);
  // library pin names
  assert.deepEqual(m.blocks.find(b => b.name === 'U1').pins.map(p => `${p.name}=${p.signal}`).sort(), ['I0=U1_I0', 'I1=U1_I1', 'I2=U1_I2', 'O=U1_O']);
  assert.deepEqual(m.blocks.find(b => b.name === 'U5').pins.map(p => p.name).sort(), ['A0', 'A1', 'A2', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'E']);
  assert.deepEqual(m.blocks.find(b => b.name === 'U8').pins.map(p => p.name).sort(), ['A(2:0)', 'I(7:0)', 'V']);
  // the library ANDnBk is drawn with its bubbles; the custom symbols come with HDL modules that compile
  assert.equal(m.blockdefs.get('and3b2').shapes.filter(s => s.kind === 'circle').length, 2);
  const hdl = ex.files.filter(f => f.kind === 'hdl');
  assert.deepEqual(hdl.map(f => f.path).sort(), ['xl_dec3_bus.vhd', 'xl_dec4_e.vhd', 'xl_demux2_w4.vhd', 'xl_enc2.vhd', 'xl_or2b1_w4.vhd', 'xl_penc3_bus.vhd']);
  compiles(Object.fromEntries(hdl.map(f => [f.path, f.text])), 'xl_penc3_bus');
  for (const [n, t] of [['xl_dec4_e', { type: 'decoder', params: { n: 4, en: true, bus: false } }], ['xl_penc3_bus', { type: 'encoder', params: { n: 3, mode: 'priority', bus: true } }],
    ['xl_enc2', { type: 'encoder', params: { n: 2, mode: 'one-hot', bus: false } }], ['xl_demux2_w4', { type: 'demux', params: { sel: 2, width: 4 } }], ['xl_or2b1_w4', { type: 'or2b1', params: { width: 4 } }]])
    assert.deepEqual(decodeXlSymbol(n), t, n);
  // back into XAIlinx: same symbols, same parameters, same nets
  const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const back = importIseSch(ex.xml, { name: 'newlib', symbols });
  assert.deepEqual(back.warnings.filter(w => /^connectivity|schematic check/.test(w)), []);
  const desc = d => d.symbols.map(s => `${s.name}:${s.type}:${['width', 'n', 'en', 'bus', 'mode', 'sel'].filter(k => k in s.params && (s.type !== 'decoder' || k !== 'width')).map(k => `${k}=${s.params[k]}`).join(',')}`).sort();
  assert.deepEqual(desc(back.doc), desc(doc));
  assert.deepEqual(partition(back.doc), partition(doc));
});

test('import: ISE D2_4E / D3_8E / D4_16E become the decoder symbol, inverted-input NAND/NOR the native symbols; simulates like the ISE function', () => {
  const doc = libDoc();
  // as ISE would write it: D4_16E is a library symbol there
  const ex = exportIseSch(doc, {});
  const xml = ex.xml.replace(/xl_dec4_e/g, 'd4_16e');
  const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const r = importIseSch(xml, { name: 'newlib', symbols });
  assert.deepEqual(r.warnings.filter(w => /^connectivity|schematic check|no XAIlinx equivalent/.test(w)), []);
  assertSameConnectivity(xml, r);
  const by = n => r.doc.symbols.find(s => s.name === n);
  for (const [n, k] of [['U4', 2], ['U5', 3], ['U6', 4]]) {
    assert.equal(by(n).type, 'decoder');
    assert.deepEqual([by(n).params.n, by(n).params.en, by(n).params.bus], [k, true, false]);
  }
  assert.equal(by('U2').type, 'nor2b1');
  assert.equal(r.doc.symbols.filter(s => s.type === 'inv').length, 0);
  // function of the imported D4_16E and NOR2B1 (VHDL and Verilog)
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(r.doc, { lang });
    assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error').map(d => d.message), [], g.code);
    const tb = lang === 'vhdl' ? `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal a : unsigned(3 downto 0); signal e, i0, i1, o : std_logic; signal d : std_logic_vector(15 downto 0);
begin
  dut : entity work.newlib port map (U6_A0 => a(0), U6_A1 => a(1), U6_A2 => a(2), U6_A3 => a(3), U6_E => e,
    U6_D0 => d(0), U6_D1 => d(1), U6_D2 => d(2), U6_D3 => d(3), U6_D4 => d(4), U6_D5 => d(5), U6_D6 => d(6), U6_D7 => d(7),
    U6_D8 => d(8), U6_D9 => d(9), U6_D10 => d(10), U6_D11 => d(11), U6_D12 => d(12), U6_D13 => d(13), U6_D14 => d(14), U6_D15 => d(15),
    U2_I0 => i0, U2_I1 => i1, U2_O => o);
  process variable errs : integer := 0; variable x : unsigned(5 downto 0); begin
    for i in 0 to 63 loop
      x := to_unsigned(i, 6); a <= x(3 downto 0); e <= x(4); i0 <= x(0); i1 <= x(5); wait for 1 ns;
      for k in 0 to 15 loop
        if (d(k) = '1') /= (e = '1' and to_integer(a) = k) then errs := errs + 1; end if;
      end loop;
      if o /= not ((not i0) or i1) then errs := errs + 1; end if;
    end loop;
    report "errs=" & integer'image(errs); wait;
  end process;
end;` : `module tb;
  reg [3:0] a; reg e, i0, i1; wire o; wire [15:0] d; integer i, k, errs = 0;
  newlib dut (.U6_A0(a[0]), .U6_A1(a[1]), .U6_A2(a[2]), .U6_A3(a[3]), .U6_E(e),
    .U6_D0(d[0]), .U6_D1(d[1]), .U6_D2(d[2]), .U6_D3(d[3]), .U6_D4(d[4]), .U6_D5(d[5]), .U6_D6(d[6]), .U6_D7(d[7]),
    .U6_D8(d[8]), .U6_D9(d[9]), .U6_D10(d[10]), .U6_D11(d[11]), .U6_D12(d[12]), .U6_D13(d[13]), .U6_D14(d[14]), .U6_D15(d[15]),
    .U2_I0(i0), .U2_I1(i1), .U2_O(o));
  initial begin
    for (i = 0; i < 64; i = i + 1) begin
      {i1, e, a} = i; i0 = i[0]; #1;
      if (d !== (e ? (16'b1 << a) : 16'b0)) errs = errs + 1;
      if (o !== ~(~i0 | i1)) errs = errs + 1;
    end
    $display("errs=%0d", errs);
  end
endmodule`;
    const rs = runSim({ [g.filename]: g.code, [lang === 'vhdl' ? 'tb.vhd' : 'tb.v']: tb }, 'tb', 1e6);
    assert.ok(logOf(rs).includes('errs=0'), lang + '\n' + logOf(rs).join('\n'));
  }
});
