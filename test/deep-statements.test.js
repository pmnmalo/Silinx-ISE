// Deeply nested statements (#3490): begin … end blocks, ifs (with an else or not), cases, loops and generates nested in
// one another recursed once per level in the parsers and the passes after them (the elaboration, the simulator, the
// design checks, the synthesis input, the translations), and overflowed the stack from about 600 levels (VHDL's ifs in
// the elaboration) to 1500 (Verilog's begin … end in the parser). As expressions are (#3395), the parsers read
// statements nested MAX_NESTING (256) levels deep, the outermost construct of the module or architecture the first
// one (an always, a process, a generate block, any VHDL concurrent statement), and every pass after them takes them;
// a deeper statement is an error of the file at its first token, one error for the outermost statement however deep it
// nests, the statement skipped and the rest of the file read. Each kind, MAX_NESTING levels deep in VHDL and
// Verilog: Check Syntax with no warnings, simulated against values computed here, the synthesis input with no
// warnings, translated both ways, checked and simulated again; one level more, and 20 000 levels, the error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import { translateSource } from '../core/translate.js';
import { MAX_NESTING, STMT_NESTING_MESSAGE } from '../packages/silinx-hdl/src/util.js';

const DEEP = 20000;
const pad = '    ';

// Each kind: the lines before its constructs (head), the level of the first one (k0), the construct of level k
// opened (open) and closed (close), the innermost statement (inner, a level of its own unless innerFree), the lines
// after them (tail), and the value of y at a (the reference); untranslated: an if generate's translation loses its
// body or is refused (#3501); unsynthesized: the synthesis input of nested loops takes time exponential in their depth
// (#3504). Each construct on a line of its own: the statement of level k (k0 <= k) on line head.length + k - k0 + 1,
// at column 5.
const VERILOG_ALWAYS = ['module nest(input [7:0] a, output reg [7:0] y);', '  always @* begin', '    y = 0;'];
const VHDL_HEAD = ['library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;',
  'entity nest is port (a : in unsigned(7 downto 0); y : out unsigned(7 downto 0)); end nest;', 'architecture rtl of nest is', 'begin'];
const VHDL_PROCESS = [...VHDL_HEAD, '  process (a) begin', '    y <= (others => \'0\');'];
const KINDS = {
  verilog: {
    begin: { head: VERILOG_ALWAYS, k0: 2, open: () => 'begin', close: () => 'end', inner: 'y = a + 1;', tail: ['  end', 'endmodule'], ref: a => (a + 1) % 256 },
    if: { head: VERILOG_ALWAYS, k0: 2, open: k => `if (a > ${k % 128})`, close: () => '', inner: 'y = a + 1;', tail: ['  end', 'endmodule'], ref: a => (a >= 128 ? (a + 1) % 256 : 0) },
    ifelse: { head: VERILOG_ALWAYS, k0: 2, open: k => `if (a > ${k % 128})`, close: k => `else y = ${k};`, inner: 'y = a + 1;', tail: ['  end', 'endmodule'], ref: a => (a >= 128 ? (a + 1) % 256 : a < 2 ? 2 : a) },
    case: { head: VERILOG_ALWAYS, k0: 2, open: () => 'case (a[0]) 1\'b1:', close: () => 'default: y = 7; endcase', inner: 'y = a + 1;', tail: ['  end', 'endmodule'], ref: a => (a % 2 ? (a + 1) % 256 : 7) },
    generate: { head: ['module nest(input [7:0] a, output [7:0] y);'], k0: 1, open: () => 'if (1) begin', close: () => 'end', inner: 'assign y = a + 1;', innerFree: true, tail: ['endmodule'], ref: a => (a + 1) % 256, untranslated: true }
  },
  vhdl: {
    if: { head: VHDL_PROCESS, k0: 2, open: k => `if a > ${k % 128} then`, close: k => `else y <= to_unsigned(${k}, 8); end if;`, inner: 'y <= a + 1;', tail: ['  end process;', 'end rtl;'], ref: a => (a >= 128 ? (a + 1) % 256 : a < 2 ? 2 : a) },
    loop: { head: VHDL_PROCESS, k0: 2, open: k => `for i${k} in 0 to 0 loop`, close: () => 'end loop;', inner: 'y <= a + 1;', tail: ['  end process;', 'end rtl;'], ref: a => (a + 1) % 256, unsynthesized: true },
    case: { head: VHDL_PROCESS, k0: 2, open: () => 'case a(0) is when \'1\' =>', close: () => 'when others => y <= to_unsigned(7, 8); end case;', inner: 'y <= a + 1;', tail: ['  end process;', 'end rtl;'], ref: a => (a % 2 ? (a + 1) % 256 : 7) },
    generate: { head: VHDL_HEAD, k0: 1, open: k => `g${k}: if true generate`, close: () => 'end generate;', inner: 'y <= a + 1;', tail: ['end rtl;'], ref: a => (a + 1) % 256, untranslated: true },
    block: { head: VHDL_HEAD, k0: 1, open: k => `b${k}: block begin`, close: () => 'end block;', inner: 'y <= a + 1;', tail: ['end rtl;'], ref: a => (a + 1) % 256 }
  }
};

// the design of a kind, its deepest statement at level d (the innermost one; a generate's innermost block)
function design(kind, d) {
  const last = kind.innerFree ? d : d - 1;
  const levels = Array.from({ length: last - kind.k0 + 1 }, (_, i) => kind.k0 + i);
  return [...kind.head, ...levels.map(k => pad + kind.open(k)), pad + kind.inner, ...levels.reverse().map(k => pad + kind.close(k)), ...kind.tail, ''].join('\n');
}
// the line of the statement of level k
const lineOf = (kind, k) => kind.head.length + k - kind.k0 + 1;

const STEPS = [0, 1, 2, 7, 100, 127, 128, 129, 200, 254, 255];
const tbVhdl = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb is end tb;

architecture sim of tb is
  signal a, y : unsigned(7 downto 0);
begin
  uut: entity work.nest port map (a => a, y => y);
  process begin
${STEPS.map(x => `    a <= to_unsigned(${x}, 8);
    wait for 10 ns;
    report integer'image(to_integer(y));`).join('\n')}
    wait;
  end process;
end sim;
`;
const tbVerilog = `module tb;
  reg [7:0] a;
  wire [7:0] y;
  nest uut(.a(a), .y(y));
  initial begin
${STEPS.map(x => `    a = ${x};
    #10 $display("%0d", y);`).join('\n')}
  end
endmodule
`;
const file = lang => (lang === 'vhdl' ? 'nest.vhd' : 'nest.v');
const tb = lang => (lang === 'vhdl' ? { path: 'tb.vhd', text: tbVhdl } : { path: 'tb.v', text: tbVerilog });

// Check Syntax of the design (nest): its errors and warnings, the design checks' included
function checkSyntax(path, text) {
  const lib = compile([{ path, text }]);
  const d = elaborate(lib, 'nest');
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map(e => `${e.severity}: ${e.message}`);
}

// the simulation's written values (any warning or error fails)
function run(srcs) {
  const r = simulate(srcs, 'tb');
  assert.deepEqual(r.errors.map(e => e.message), []);
  const log = r.sim.log.map(l => `${l.kind}: ${l.text}`);
  assert.ok(log.every(l => /^(note|print): /.test(l)), log.join('\n'));
  return log.map(l => l.replace(/^\w+: /, ''));
}
const expected = kind => STEPS.map(a => String(kind.ref(a)));

for (const lang of ['vhdl', 'verilog']) {
  for (const [name, kind] of Object.entries(KINDS[lang])) {
    test(`#3490 ${lang} ${name}: statements nested ${MAX_NESTING} levels deep check with no warnings, simulate to their values, and make their synthesis input`, () => {
      const text = design(kind, MAX_NESTING);
      assert.deepEqual(checkSyntax(file(lang), text), []);
      assert.deepEqual(run([{ path: file(lang), text }, tb(lang)]), expected(kind));
      if (kind.unsynthesized) return;
      const { text: v, warnings } = synthesisInput(elaborate(compile([{ path: file(lang), text }]), 'nest'));
      assert.deepEqual(warnings, []);
      assert.match(v, /^module nest \(/m);
    });

    if (!kind.untranslated) test(`#3490 ${lang} ${name}: statements nested ${MAX_NESTING / 2} levels deep translated, checked, then simulated as the original`, () => {
      const to = lang === 'vhdl' ? 'verilog' : 'vhdl';
      // (half the limit: a translation nests more, each branch of an if in a begin … end in Verilog)
      const text = design(kind, MAX_NESTING / 2);
      const tr = translateSource(text, { path: file(lang), to });
      assert.deepEqual(tr.errors, []);
      assert.deepEqual(checkSyntax(file(to), tr.text), []);
      assert.deepEqual(run([{ path: file(to), text: tr.text }, tb(to)]), expected(kind));
    });

    test(`#3490 ${lang} ${name}: one level more than ${MAX_NESTING}, and ${DEEP} levels, one error at the statement past the limit, the rest read`, () => {
      for (const d of [MAX_NESTING + 1, DEEP]) {
        const text = design(kind, d);
        const lib = compile([{ path: file(lang), text }]);
        assert.deepEqual(lib.errors.map(e => `${e.file}:${e.line}:${e.col} ${e.severity}: ${e.message}`),
          [`${file(lang)}:${lineOf(kind, MAX_NESTING + 1)}:${pad.length + 1} error: ${STMT_NESTING_MESSAGE}`]);
        // (the rest of the file read: the design elaborates, with no error, the statement past the limit left out)
        const el = elaborate(lib, 'nest');
        assert.ok(el.top, JSON.stringify(el.diags));
        assert.deepEqual(el.diags.filter(e => e.severity === 'error'), []);
        // (simulate: the file's error, not thrown)
        const r = simulate([{ path: file(lang), text }, tb(lang)], 'tb');
        assert.equal(r.sim, null);
        assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [`${file(lang)}:${lineOf(kind, MAX_NESTING + 1)} ${STMT_NESTING_MESSAGE}`]);
      }
    });
  }
}

// a statement at the limit holding an expression at its own limit (#3395): the two depths add up in the passes
test(`#3490 a statement ${MAX_NESTING} levels deep with an expression ${MAX_NESTING} levels deep`, () => {
  const n = MAX_NESTING - 1;
  const kinds = {
    verilog: { ...KINDS.verilog.begin, inner: `y = ${'~'.repeat(n)}a;`, ref: a => (n % 2 ? 255 - a : a) },
    vhdl: { ...KINDS.vhdl.block, inner: `y <= ${'not ('.repeat(n)}a${')'.repeat(n)};`, ref: a => (n % 2 ? 255 - a : a) }
  };
  for (const [lang, kind] of Object.entries(kinds)) {
    const text = design(kind, MAX_NESTING);
    assert.deepEqual(checkSyntax(file(lang), text), []);
    assert.deepEqual(run([{ path: file(lang), text }, tb(lang)]), expected(kind));
    assert.deepEqual(synthesisInput(elaborate(compile([{ path: file(lang), text }]), 'nest')).warnings, []);
  }
});

// one error per outermost statement too deep, and the statements and modules after it read
test('#3490 two statements too deep: two errors; the modules after them read', () => {
  const deep = KINDS.verilog.ifelse;
  const one = design(deep, DEEP).replace(/endmodule\n$/, '');
  const text = `${one}  always @* begin\n    y = 0;\n${Array.from({ length: DEEP }, () => '    begin').join('\n')}\n    y = 1;\n${Array.from({ length: DEEP }, () => '    end').join('\n')}\n  end\nendmodule\nmodule after(input a, output b);\n  assign b = ~a;\nendmodule\n`;
  const lib = compile([{ path: 'm.v', text }]);
  const second = one.split('\n').length + 2 + MAX_NESTING - 1;
  assert.deepEqual(lib.errors.map(e => `${e.line}:${e.col} ${e.message}`),
    [`${lineOf(deep, MAX_NESTING + 1)}:5 ${STMT_NESTING_MESSAGE}`, `${second}:5 ${STMT_NESTING_MESSAGE}`]);
  assert.ok(elaborate(lib, 'after').top);
  const h = design(KINDS.vhdl.if, DEEP) + 'entity later is port (a : in bit; b : out bit); end later;\narchitecture r of later is begin b <= not a; end r;\n';
  const hl = compile([{ path: 'm.vhd', text: h }]);
  assert.deepEqual(hl.errors.map(e => e.message), [STMT_NESTING_MESSAGE]);
  assert.ok(elaborate(hl, 'later').top);
});

// the skipped statement's own constructs: Verilog's labels, fork … join, wait fork, a for's header, else if chains, a
// generate for with an always and a case in it; VHDL's while loops, elsif branches, cases, a process with a function of
// its own in a generate (each one checked a few levels deep with no error first)
test('#3490 the statement past the limit skipped whole, whatever it holds', () => {
  const cases = [
    ['nest.v', KINDS.verilog.begin, 'lbl: begin fork : f y = 1; join wait fork; for (int i = 0; i < 2; i = i + 1) if (a[0]) y = 2; else if (a[1]) y = 3; else begin y = 4; end end : lbl'],
    ['nest.v', KINDS.verilog.generate, 'for (genvar i = 0; i < 1; i = i + 1) begin : g wire w; assign w = a[0]; always @* begin case (w) 1\'b1: ; default: ; endcase end end assign y = a;'],
    ['nest.vhd', KINDS.vhdl.loop, 'while a = 0 loop if a(0) = \'1\' then null; elsif a(1) = \'1\' then y <= a; else case a(2) is when others => null; end case; end if; end loop;'],
    ['nest.vhd', KINDS.vhdl.generate, 'p: process (a) function f(x : unsigned) return unsigned is begin return x; end function; begin y <= f(a); end process;']
  ];
  for (const [path, kind, inner] of cases) {
    assert.deepEqual(compile([{ path, text: design({ ...kind, inner }, 4) }]).errors, [], inner);
    // (the innermost statement at level MAX_NESTING + 1: a generate's innermost item is not a level, its constructs
    // MAX_NESTING levels deep)
    const lib = compile([{ path, text: design({ ...kind, inner }, kind.innerFree ? MAX_NESTING : MAX_NESTING + 1) }]);
    assert.deepEqual(lib.errors.map(e => `${e.line}:${e.col} ${e.message}`), [`${lineOf(kind, MAX_NESTING + 1)}:5 ${STMT_NESTING_MESSAGE}`], inner);
    assert.ok(elaborate(lib, 'nest').top, inner);
  }
});
