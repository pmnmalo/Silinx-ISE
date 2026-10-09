// Bidirectional (inout, tri-state) ports in the beginner wizards:
//   Module Wizard (core/modgen.js generateModule): every option combination with inout ports compiles,
//     elaborates and simulates in VHDL and Verilog; the tri-state template, once its TODO lines are
//     filled in, drives / releases the bus and reads it back;
//   Schematic Wizard (core/modgen.js schematicFromPorts): inout markers on the right edge below the
//     outputs, netlist() / generateHdl() pass; the live simulation (core/schlive.js) drives / releases
//     a bidirectional marker wired to a module with an inout port;
//   Test Bench Wizard (core/testbench.js): a bidirectional register driven and released by the bench,
//     PASS with the right expected values (typed in or from a trace run), FAIL with a wrong one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateModule, schematicFromPorts, checkPorts, QUICK_PORTS } from '../core/modgen.js';
import { netlist, generateHdl, normalizeDoc, portBox, newDoc, symbolPins, modulesFromLibrary } from '../core/schdoc.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { buildLiveSim } from '../core/schlive.js';
import { tbPorts, makeVectors, parseDrive, generateTestbench, expectedFromTrace, MAX_VECTORS } from '../core/testbench.js';
import * as V from '../core/values.js';

const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');
const LANGS = ['vhdl', 'verilog'];

function check(text, lang, top) {
  const src = { path: `src/${top}.${ext(lang)}`, lang, text };
  const lib = compile([src]);
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter((d) => d.severity === 'error');
  assert.deepEqual(errors.map((e) => `${e.line}: ${e.message}`), [], `${top} (${lang}) compiles and elaborates:\n${text}`);
  const r = simulate([src], top, { until: 1e6 });
  assert.deepEqual(r.errors, [], `${top} (${lang}) simulates`);
  assert.deepEqual((r.sim?.log || []).filter((l) => l.kind === 'error' || l.kind === 'failure').map((l) => l.text), []);
  return design;
}
const sim = (files, top) => {
  const r = simulate(files, top, { until: 1e12 });
  assert.deepEqual(r.errors.map((e) => `${e.file}:${e.line} ${e.message}`), [], files.map((f) => f.text).join('\n\n'));
  return r.sim.log.map((l) => l.text);
};
// replace one line of a generated module (the student filling a TODO in)
const fill = (text, re, by) => { assert.match(text, re); return text.replace(re, by); };

// ------------------------------------------------------------------ Module Wizard
const IO_PORTS = [
  { name: 'clk', dir: 'in', width: 1 },
  { name: 'rst', dir: 'in', width: 1 },
  { name: 'en', dir: 'in', width: 1 },
  { name: 'rd', dir: 'in', width: 1, desc: 'drive the bus' },
  { name: 'data', dir: 'inout', width: 8, desc: 'bidirectional data bus' },
  { name: 'sda', dir: 'inout', width: 1 },
  { name: 'q', dir: 'out', width: 8 },
];

test('module generator, inout ports: every option combination compiles, elaborates and simulates (VHDL and Verilog)', () => {
  let n = 0;
  const sets = [IO_PORTS, IO_PORTS.filter((p) => p.dir !== 'out'), IO_PORTS.filter((p) => p.dir === 'inout'), [IO_PORTS[0], IO_PORTS[4]]];
  for (const lang of LANGS) {
    for (const generics of [[], [{ name: 'W', default: '8' }]]) {
      for (const combStyle of ['assign', 'process']) {
        for (const ports of sets) {
          const name = `ci_${n++}`;
          const text = generateModule({ name, lang, ports, generics, kind: 'comb', combStyle });
          const d = check(text, lang, name);
          assert.deepEqual(d.top.ports.map((p) => `${p.name}:${p.dir}:${p.sig.t.w}`), ports.map((p) => `${p.name}:${p.dir}:${p.width}`));
          // the tri-state driver of each bidirectional port, with its output enable
          for (const p of ports.filter((x) => x.dir === 'inout')) {
            assert.match(text, lang === 'vhdl'
              ? new RegExp(`${p.name} <= ${p.name}_out when ${p.name}_oe = '1' else ${p.width > 1 ? "\\(others => 'Z'\\)" : "'Z'"};`)
              : new RegExp(`assign ${p.name} = ${p.name}_oe \\? ${p.name}_out : ${p.width}'bz;`));
            assert.match(text, lang === 'vhdl' ? new RegExp(`signal ${p.name}_oe : std_logic;`) : new RegExp(`(reg |wire) ${p.name}_oe;`));
          }
          if (combStyle === 'process') assert.match(text, lang === 'vhdl' ? /process \([^)]*\bdata\b[^)]*\)/ : /always @\(\*\)/);
        }
      }
      for (const mode of ['none', 'sync', 'async']) {
        for (const enable of ['', 'en']) {
          for (const ports of [IO_PORTS, IO_PORTS.filter((p) => p.dir !== 'out')]) {
            const name = `si_${n++}`;
            const text = generateModule({ name, lang, ports, generics, kind: 'seq', clock: 'clk', reset: { port: 'rst', mode, active: '1' }, enable });
            check(text, lang, name);
            assert.match(text, lang === 'vhdl' ? /data <= data_out when data_oe = '1' else \(others => 'Z'\);/ : /assign data = data_oe \? data_out : 8'bz;/);
            assert.match(text, lang === 'vhdl' ? /inout std_logic_vector\(7 downto 0\)/ : /inout\s+wire \[7:0\] data/);
          }
        }
      }
    }
  }
  assert.ok(n > 50, `${n} modules`);
  // quick-add has bidirectional ports; names clashing with the internal ones get a fresh name
  assert.ok(QUICK_PORTS.some((p) => p.dir === 'inout' && p.width === 8));
  for (const lang of LANGS) assert.equal(checkPorts(QUICK_PORTS, { lang, name: 'top' }), null);
  const clash = generateModule({ name: 'clash', lang: 'vhdl', ports: [{ name: 'd', dir: 'inout', width: 4 }, { name: 'd_oe', dir: 'in', width: 1 }], kind: 'comb' });
  assert.match(clash, /signal d_oe_1 : std_logic;/);
  check(clash, 'vhdl', 'clash');
});

const TRI_PORTS = [{ name: 'rd', dir: 'in', width: 1 }, { name: 'a', dir: 'in', width: 8 }, { name: 'data', dir: 'inout', width: 8 }, { name: 'y', dir: 'out', width: 8 }];
// the student's logic: drive data with a while rd = 1, y = what is on the bus
function triFilled(lang, combStyle) {
  let t = generateModule({ name: 'tribus', lang, ports: TRI_PORTS, kind: 'comb', combStyle });
  if (combStyle === 'assign') {
    t = lang === 'vhdl'
      ? fill(fill(fill(t, /^  data_oe <= '0';.*$/m, '  data_oe <= rd;'), /^  data_out <= \(others => '0'\);$/m, '  data_out <= a;'), /^  y <= \(others => '0'\);$/m, '  y <= data;')
      : fill(fill(fill(t, /^  assign data_oe = 1'b0;.*$/m, '  assign data_oe = rd;'), /^  assign data_out = 8'b0;$/m, '  assign data_out = a;'), /^  assign y = 8'b0;$/m, '  assign y = data;');
  } else {
    t = lang === 'vhdl'
      ? fill(t, /^    -- \(data_oe <= '1' where the module must drive data\)$/m, "    if rd = '1' then data_oe <= '1'; data_out <= a; end if;\n    y <= data;")
      : fill(t, /^    \/\/ \(data_oe = 1'b1 where the module must drive data\)$/m, '    if (rd) begin data_oe = 1\'b1; data_out = a; end\n    y = data;');
  }
  return t;
}
const TRI_TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal rd : std_logic := '0';
  signal a, y : std_logic_vector(7 downto 0) := (others => '0');
  signal data : std_logic_vector(7 downto 0) := (others => 'Z');   -- resolved: the bench and the module drive it
begin
  uut : entity work.tribus port map (rd => rd, a => a, data => data, y => y);
  process begin
    a <= "10100101"; rd <= '1'; wait for 10 ns;                 -- the module drives the bus
    assert data = "10100101" report "ERROR the module does not drive the bus" severity error;
    assert y = "10100101" report "ERROR the module does not read its own value" severity error;
    rd <= '0'; data <= "00111100"; wait for 10 ns;               -- the bench drives the bus
    assert y = "00111100" report "ERROR the module does not read the bus" severity error;
    data <= (others => 'Z'); wait for 10 ns;                     -- nobody drives it
    assert data = "ZZZZZZZZ" report "ERROR the bus is not released" severity error;
    rd <= '1'; data <= "11110000"; wait for 10 ns;               -- both drive it: conflict
    assert data = "1X1X0X0X" report "ERROR no conflict" severity error;          -- 0 against 1: X
    report "DONE"; wait;
  end process;
end t;`,
  verilog: `module tb;
  reg rd = 0; reg [7:0] a = 0; reg [7:0] drv = 8'bz;
  wire [7:0] data, y;
  assign data = drv;   // the bench's driver of the bus (z = released)
  tribus uut(.rd(rd), .a(a), .data(data), .y(y));
  initial begin
    a = 8'b10100101; rd = 1; #10;
    if (data !== 8'b10100101) $display("ERROR the module does not drive the bus");
    if (y !== 8'b10100101) $display("ERROR the module does not read its own value");
    rd = 0; drv = 8'b00111100; #10;
    if (y !== 8'b00111100) $display("ERROR the module does not read the bus");
    drv = 8'bz; #10;
    if (data !== 8'bzzzzzzzz) $display("ERROR the bus is not released");
    rd = 1; drv = 8'b11110000; #10;
    if (data !== 8'b1x1x0x0x) $display("ERROR no conflict");   // 0 against 1: x
    $display("DONE"); $finish;
  end
endmodule`,
};

test('module generator, tri-state template filled in: the module drives the bus, releases it, reads it back (both languages, both styles)', () => {
  for (const lang of LANGS) {
    for (const combStyle of ['assign', 'process']) {
      const text = triFilled(lang, combStyle);
      check(text, lang, 'tribus');
      const log = sim([{ path: `src/tribus.${ext(lang)}`, lang, text }, { path: `sim/tb.${ext(lang)}`, lang, text: TRI_TB[lang] }], 'tb');
      assert.ok(log.some((l) => /DONE/.test(l)), log.join('\n'));
      assert.deepEqual(log.filter((l) => /ERROR/.test(l)), [], `${lang} ${combStyle}:\n${text}`);
    }
  }
});

// a bidirectional register from the sequential template: loads the bus when we = 1, drives it with
// the register when rd = 1
const REG_PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'we', dir: 'in', width: 1 }, { name: 'rd', dir: 'in', width: 1 }, { name: 'data', dir: 'inout', width: 8 }, { name: 'q', dir: 'out', width: 8 }];
function regFilled(lang, name = 'bireg') {
  const t = generateModule({ name, lang, ports: REG_PORTS, kind: 'seq', clock: 'clk', reset: { mode: 'none' } });
  return lang === 'vhdl'
    ? fill(fill(fill(t, /^      --   q_reg <= data;.*$/m, "      if we = '1' then q_reg <= data; end if;"), /^  data_oe <= '0';.*$/m, '  data_oe <= rd;'), /^  data_out <= \(others => '0'\);$/m, '  data_out <= q_reg;')
    : fill(fill(fill(t, /^    \/\/   q <= data;.*$/m, '    if (we) q <= data;'), /^  assign data_oe = 1'b0;.*$/m, '  assign data_oe = rd;'), /^  assign data_out = 8'b0;$/m, '  assign data_out = q;');
}

// ------------------------------------------------------------------ Schematic Wizard
test('schematic generator, inout markers: right edge below the outputs, with their width; netlist / generateHdl / compile pass', () => {
  for (const lang of LANGS) {
    for (const outs of [[{ name: 'y', dir: 'out', width: 1 }, { name: 'led', dir: 'out', width: 8 }], []]) {
      const ports = [{ name: 'a', dir: 'in', width: 4 }, ...outs, { name: 'data', dir: 'inout', width: 8 }, { name: 'sda', dir: 'inout', width: 1 }];
      const doc = schematicFromPorts({ name: 'sch_io', lang, ports, clock: 'clk' });
      const right = doc.ports.filter((p) => p.dir !== 'in');
      assert.deepEqual(right.map((p) => `${p.name}:${p.dir}:${p.width}`), [...outs.map((p) => `${p.name}:out:${p.width}`), 'data:inout:8', 'sda:inout:1']);
      assert.equal(new Set(right.map((p) => p.x)).size, 1, 'one column on the right');
      assert.ok(right[0].x > doc.sheet.w - 300);
      const ios = doc.ports.filter((p) => p.dir === 'inout'), o = doc.ports.filter((p) => p.dir === 'out');
      if (o.length) assert.ok(ios[0].y - o[o.length - 1].y >= 120, 'an empty slot between the outputs and the bidirectional markers');
      for (const p of doc.ports) {
        const b = portBox(p);
        assert.ok(b.x >= 10 && b.x + b.w <= doc.sheet.w - 10, `${p.name} on the sheet`);
      }
      assert.deepEqual(normalizeDoc(doc), doc);
      const nl = netlist(doc);
      assert.ok(nl.diagnostics.every((d) => d.severity === 'warning' && /not connected/.test(d.message)), JSON.stringify(nl.diagnostics));
      const g = generateHdl(doc);
      assert.ok(g.diagnostics.every((d) => d.severity === 'warning'), JSON.stringify(g.diagnostics));
      assert.match(g.code, lang === 'vhdl' ? /data : inout std_logic_vector\(7 downto 0\)/ : /inout wire \[7:0\] data/);
      const d = check(g.code, lang, 'sch_io');
      assert.deepEqual(d.top.ports.filter((p) => p.dir === 'inout').map((p) => `${p.name}:${p.sig.t.w}`), ['data:8', 'sda:1']);
    }
  }
});

test('schematic with a bidirectional marker wired to a module inout port (and read by a gate): netlist, generateHdl, live simulation drive / release', () => {
  for (const lang of LANGS) {
    const sources = [{ path: `src/bireg.${ext(lang)}`, lang, text: regFilled(lang) }];
    const modules = modulesFromLibrary(compile(sources), { sources: Object.fromEntries(sources.map((s) => [s.path, s.text])) });
    // the Schematic Wizard's markers, then the module symbol and an 8-bit inverter wired to them
    const doc = schematicFromPorts({ name: 'busw', lang, ports: [{ name: 'we', dir: 'in', width: 1 }, { name: 'rd', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 8 }, { name: 'nbus', dir: 'out', width: 8 }, { name: 'data', dir: 'inout', width: 8 }], clock: 'clk' });
    const reg = { id: 'S1', type: 'module', x: 600, y: 300, rot: 0, mirror: false, name: 'u_reg', params: { module: 'bireg', generics: {} } };
    const inv = { id: 'S2', type: 'inv', x: 900, y: 600, rot: 0, mirror: false, name: 'u_inv', params: { width: 8 } };
    doc.symbols.push(reg, inv);
    const pins = (s) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], modules);
    const pin = (s, n) => pins(s).find((p) => p.name === n);
    const port = (n) => doc.ports.find((p) => p.name === n);
    let k = 0;
    // a wire a -> b with its vertical segment at x = mx (crossing wires do not connect)
    const wire = (a, b, mx) => doc.wires.push({ id: `W${++k}`, points: a.y === b.y ? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] : [{ x: a.x, y: a.y }, { x: mx, y: a.y }, { x: mx, y: b.y }, { x: b.x, y: b.y }] });
    ['clk', 'we', 'rd'].forEach((n, i) => wire(port(n), pin(reg, n), 300 + 20 * i));
    wire(pin(reg, 'q'), port('q'), 1000);
    wire(pin(reg, 'data'), port('data'), 1100);
    // the inverter reads the bus through net names (labels named like the markers join their nets)
    const stub = (pt, dx, net) => { doc.wires.push({ id: `W${++k}`, points: [{ x: pt.x + dx, y: pt.y }, { x: pt.x, y: pt.y }] }); doc.labels.push({ id: `L${k}`, x: pt.x + dx, y: pt.y, net }); };
    stub(pin(inv, 'I'), -30, 'data');
    stub(pin(inv, 'O'), 30, 'nbus');
    assert.equal(pin(reg, 'data').dir, 'inout');
    const nd = normalizeDoc(doc);
    const nl = netlist(nd, { modules });
    assert.deepEqual(nl.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message), []);
    const net = nl.portNet.get(port('data').id);
    assert.equal(net.width, 8);
    assert.ok(net.endpoints.some((e) => e.kind === 'pin' && e.pin === 'data') && net.endpoints.some((e) => e.kind === 'pin' && e.pin === 'I'));
    const g = generateHdl(nd, { modules });
    assert.deepEqual(g.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.match(g.code, lang === 'vhdl' ? /data => data/ : /\.data\(data\)/);
    // live simulation: the marker released (Z) until driven from outside
    const r = buildLiveSim(nd, { modules, sources });
    assert.deepEqual(r.errors, [], r.code);
    const live = r.live;
    const id = (n) => port(n).id;
    const bits = (n) => V.toBin(live.portValue(id(n)));
    assert.deepEqual(live.bidirs.map((b) => `${b.name}:${b.width}`), ['data:8']);
    assert.equal(live.input(id('data')), null, 'not an input');
    assert.equal(bits('data'), 'zzzzzzzz');
    live.drive(id('data'), 0xa5n);                       // the outside world drives the bus
    assert.equal(bits('data'), '10100101');
    assert.equal(bits('nbus'), '01011010', 'the gate reads the bus');
    live.set(id('we'), 1n); live.cycle(id('clk'));       // the register loads it
    assert.equal(bits('q'), '10100101');
    live.set(id('we'), 0n); live.drive(id('data'), null);  // released: nobody drives it
    assert.equal(bits('data'), 'zzzzzzzz');
    live.set(id('rd'), 1n);                              // the register drives the bus
    assert.equal(bits('data'), '10100101');
    assert.equal(bits('nbus'), '01011010');
    live.drive(id('data'), 0x0fn);                       // both drive it: conflict bits are X
    assert.equal(bits('data'), 'x0x0x1x1');
    live.drive(id('data'), null);
    assert.equal(bits('data'), '10100101');
    // a power cycle keeps the outside driver released; the register restarts at 0
    live.reset();
    assert.equal(bits('data'), '00000000');
    assert.equal(live.drive('nope', 1n), false);
  }
});

// ------------------------------------------------------------------ Test Bench Wizard
const BIREG = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity bireg is
  port (clk, we, oe : in std_logic; data : inout std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0); flag : inout std_logic);
end bireg;
architecture rtl of bireg is
  signal r : std_logic_vector(7 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then if we = '1' then r <= data; end if; end if; end process;
  data <= r when oe = '1' else (others => 'Z');
  flag <= r(0) when oe = '1' else 'Z';
  q <= r;
end rtl;`,
  verilog: `module bireg(input clk, input we, input oe, inout [7:0] data, output [7:0] q, inout flag);
  reg [7:0] r = 0;
  always @(posedge clk) if (we) r <= data;
  assign data = oe ? r : 8'bz;
  assign flag = oe ? r[0] : 1'bz;
  assign q = r;
endmodule`,
};
const BTYPES = { data: 'std_logic_vector(7 downto 0)', q: 'std_logic_vector(7 downto 0)', flag: 'std_logic' };
// write A5 (bench drives the bus), read it (bench releases it, the register drives it), write 3C, read it,
// then a vector where nobody drives the bus (not checked)
const REG_VECTORS = [
  { in: { we: '1', oe: '0' }, drv: { data: '10100101', flag: '1' }, exp: { q: '10100101', data: '10100101', flag: '1' } },
  { in: { we: '0', oe: '1' }, drv: { data: 'ZZZZZZZZ', flag: 'Z' }, exp: { q: '10100101', data: '10100101', flag: '1' } },
  { in: { we: '1', oe: '0' }, drv: { data: '00111100' }, exp: { q: '00111100', data: '00111100', flag: '-' } },
  { in: { we: '0', oe: '1' }, drv: {}, exp: { q: '00111100', data: '00111100', flag: '0' } },
  { in: { we: '0', oe: '0' }, drv: {}, exp: { q: '00111100', data: '--------', flag: null } },
];

for (const lang of LANGS) {
  test(`${lang}: test bench with inout ports: the bench drives and releases the bus; PASS, then FAIL with a wrong expected bus value`, () => {
    const dut = { path: `src/bireg.${ext(lang)}`, lang, text: BIREG[lang] };
    const ports = tbPorts(elaborate(compile([dut]), 'bireg'), BTYPES);
    assert.deepEqual(ports.map((p) => `${p.name}:${p.dir}:${p.kind}`), ['clk:in:sl', 'we:in:sl', 'oe:in:sl', 'data:inout:slv', 'q:out:slv', 'flag:inout:sl']);
    const opts = { name: 'tb_bireg', lang, uut: { name: 'bireg', params: [] }, ports, clock: { port: 'clk', periodNs: 20 }, vectors: REG_VECTORS };
    const text = generateTestbench(opts);
    if (lang === 'vhdl') {
      assert.match(text, /signal data : std_logic_vector\(7 downto 0\) := \(others => 'Z'\);/);
      assert.match(text, /signal flag : std_logic := 'Z';/);
      assert.match(text, /constant VDRV : vdrv_t := \(\n    0 => "101001011",\n    1 => "ZZZZZZZZZ",/);
      assert.match(text, /data <= VDRV\(k\)\(8 downto 1\);/);
    } else {
      assert.match(text, /reg \[7:0\] data_drv = 8'bz;\n  wire \[7:0\] data;\n  assign data = data_drv;/);
      assert.match(text, /vdrv\[1\] = 9'bzzzzzzzzz;/);
    }
    const log = sim([dut, { path: `sim/tb.${ext(lang)}`, lang, text }], 'tb_bireg');
    assert.ok(log.some((l) => /TEST PASSED: 5 vector/.test(l)), log.join('\n'));
    // a wrong value expected on the bus while the register drives it (vector 3)
    const bad = REG_VECTORS.map((v, k) => (k === 3 ? { ...v, exp: { ...v.exp, data: '00111101' } } : v));
    const log2 = sim([dut, { path: `sim/tb.${ext(lang)}`, lang, text: generateTestbench({ ...opts, vectors: bad }) }], 'tb_bireg');
    assert.ok(log2.some((l) => /vector 3: we=0 oe=1 data:drive=[Zz]{8} flag:drive=[Zz] -> expected 00111100001111010, got 00111100001111000/.test(l)), log2.join('\n'));
    assert.ok(log2.some((l) => /TEST FAILED: 1 of 5/.test(l)));
    // released and nobody drives: a checked value fails (Z is not 0 / 1)
    const bad2 = REG_VECTORS.map((v, k) => (k === 4 ? { ...v, exp: { ...v.exp, data: '00000000' } } : v));
    const log3 = sim([dut, { path: `sim/tb.${ext(lang)}`, lang, text: generateTestbench({ ...opts, vectors: bad2 }) }], 'tb_bireg');
    assert.ok(log3.some((l) => /TEST FAILED: 1 of 5/.test(l)), log3.join('\n'));
  });

  test(`${lang}: test bench with an inout port: generated vectors (drive / read pairs), expected bus values from a trace run pass`, () => {
    // the bidirectional register of the Module Wizard's sequential template, filled in
    const dut = { path: `src/bireg.${ext(lang)}`, lang, text: regFilled(lang) };
    const ports = tbPorts(elaborate(compile([dut]), 'bireg'), { data: 'std_logic_vector(7 downto 0)', q: 'std_logic_vector(7 downto 0)' });
    const ins = ports.filter((p) => p.dir === 'in' && p.name !== 'clk'), ios = ports.filter((p) => p.dir === 'inout'), outs = ports.filter((p) => p.dir === 'out');
    const raw = makeVectors([...ins, ...ios], { mode: 'random', count: 24, seed: 7 });
    assert.equal(raw.length, 24);
    raw.forEach((v, k) => assert.equal(/Z/.test(v.drv.data), k % 2 === 1, `vector ${k}: drive, then read`));
    for (let k = 0; k < raw.length; k += 2) assert.deepEqual(raw[k + 1].in, raw[k].in, 'a read vector keeps the inputs');
    // the bench drives only while the design does not (rd = 0): no conflicts
    const vectors = raw.map((v) => ({ in: { ...v.in, rd: /Z/.test(v.drv.data) ? v.in.rd : '0' }, drv: v.drv }));
    const base = { name: 'tb_bireg', lang, uut: { name: 'bireg', params: [] }, ports, clock: { port: 'clk', periodNs: 20 } };
    const traceTb = generateTestbench({ ...base, name: 'tb_trace', vectors, trace: true });
    const tlog = sim([dut, { path: `sim/tb_trace.${ext(lang)}`, lang, text: traceTb }], 'tb_trace');
    const exp = expectedFromTrace(tlog, [...outs, ...ios], vectors.length);
    assert.ok(exp.every(Boolean));
    // a read vector with rd = 0: nobody drives the bus -> not checked ('-'); a drive vector: the driven value
    vectors.forEach((v, k) => {
      if (!/Z/.test(v.drv.data)) assert.equal(exp[k].data, v.drv.data, `vector ${k}: the bus carries the driven value`);
      else if (v.in.rd === '0') assert.equal(exp[k].data, '--------');
      else assert.equal(exp[k].data, exp[k].q, `vector ${k}: the register drives the bus`);
    });
    assert.ok(vectors.some((v, k) => /Z/.test(v.drv.data) && v.in.rd === '1' && /[01]/.test(exp[k].data)), 'some read-back is checked');
    const text = generateTestbench({ ...base, vectors: vectors.map((v, k) => ({ ...v, exp: exp[k] })) });
    const log = sim([dut, { path: `sim/tb_bireg.${ext(lang)}`, lang, text }], 'tb_bireg');
    assert.ok(log.some((l) => /TEST PASSED: 24 vector/.test(l)), log.join('\n'));
  });
}

test('test bench values and vectors for inout ports: parseDrive, exhaustive / walking pairs, limits', () => {
  assert.equal(parseDrive('', 4), 'ZZZZ');
  assert.equal(parseDrive('z', 4), 'ZZZZ');
  assert.equal(parseDrive('ZZZZ', 4), 'ZZZZ');
  assert.equal(parseDrive('0x5', 4), '0101');
  assert.equal(parseDrive('101', 4), '0101');
  assert.equal(parseDrive('z01', 4), 'ZZ01');
  assert.equal(parseDrive('1z', 4), '001Z');
  assert.equal(parseDrive('d12', 8), '00001100');
  assert.throws(() => parseDrive('1-0', 3), /cannot be '-'/);
  assert.throws(() => parseDrive('1zzzz', 4), /does not fit/);
  const ins = [{ name: 'a', dir: 'in', width: 1 }], io = [{ name: 'b', dir: 'inout', width: 2 }];
  const ex = makeVectors([...ins, ...io], { mode: 'exhaustive' });
  assert.equal(ex.length, 16);
  assert.deepEqual(ex.slice(0, 4), [{ in: { a: '0' }, drv: { b: '00' } }, { in: { a: '0' }, drv: { b: 'ZZ' } }, { in: { a: '0' }, drv: { b: '01' } }, { in: { a: '0' }, drv: { b: 'ZZ' } }]);
  const wk = makeVectors([...ins, ...io], { mode: 'walking' });
  assert.equal(wk.length, 2 * (2 + 3 + 3));
  assert.equal(makeVectors([...ins, ...io], { mode: 'count', count: 5 }).length, 5);
  // without inout ports: the vectors are as before (no drv)
  assert.deepEqual(makeVectors(ins, { mode: 'exhaustive' }), [{ in: { a: '0' } }, { in: { a: '1' } }]);
  assert.throws(() => makeVectors([{ name: 'w', dir: 'inout', width: Math.log2(MAX_VECTORS) }], { mode: 'exhaustive' }), /read vectors/);
  // bad drive bits are refused by the generator
  const ports = [{ name: 'a', dir: 'in', width: 1, kind: 'sl' }, { name: 'b', dir: 'inout', width: 2, kind: 'slv', left: 1, right: 0, desc: true, bus: true }];
  assert.throws(() => generateTestbench({ name: 'tb', uut: { name: 'm' }, ports, vectors: [{ in: { a: '0' }, drv: { b: '0-' } }] }), /0\/1\/Z bits/);
  assert.match(generateTestbench({ name: 'tb', uut: { name: 'm' }, ports, vectors: [{ in: { a: '0' } }] }), /Bidirectional port\(s\) b: in each vector the bench drives the bus/);
});
