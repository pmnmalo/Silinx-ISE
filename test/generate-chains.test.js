// A long generate chain (#3500): an if … else if generate (Verilog), an if … elsif generate (VHDL) and a case generate
// (both: a chain of if generates, each alternative the else of the one before) of 20 000 branches, which overflowed the
// stack from about 3000 (Verilog's parser read an else if by calling itself, the elaboration took the else branch by
// calling itself, VHDL's parser and its pure-function check the same), as #2577 did for the sequential chains. Each
// one: Check Syntax (the design checks too) with no warnings; simulated with the parameter at its first branches, its
// last ones and past them (the else, the default, others), against the values computed here; the synthesis input with
// no warnings, the chosen branch in it; the hierarchy's top; translated, checked and simulated again (Verilog to VHDL:
// past 16 branches the earlier ones' negation a constant per branch, the text no longer quadratic). A VHDL alternative elaborates in the generate's scope (g.s), as its first one does, no longer in
// one more scope per elsif before it (g.g.g.s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate, topCandidates, implRoots } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import { translateSource } from '../core/translate.js';
import { genChain, walkItems } from '../core/util.js';

const N = 20000;
const val = i => (i * 7) % 256;   // (the value of branch i)
// the parameter's values simulated, and y at each: branch P's value, all ones past the last branch
const PS = [0, 1, 2, 255, N - 2, N - 1, N, N + 5];
const ref = p => (p < N ? val(p) : 255);

const VERILOG = {
  if: n => [`if (P == 0) begin : b0 assign y = 8'd0; end`,
    ...Array.from({ length: n - 1 }, (_, k) => `else if (P == ${k + 1}) begin : b${k + 1} assign y = 8'd${val(k + 1)}; end`),
    `else begin : bx assign y = 8'hff; end`],
  case: n => ['case (P)', ...Array.from({ length: n }, (_, i) => `  ${i}: begin : b${i} assign y = 8'd${val(i)}; end`), `  default: begin : bx assign y = 8'hff; end`, 'endcase']
};
const VHDL = {
  if: n => [`g: if P = 0 generate y <= to_unsigned(0, 8);`,
    ...Array.from({ length: n - 1 }, (_, k) => `elsif P = ${k + 1} generate y <= to_unsigned(${val(k + 1)}, 8);`),
    `else generate y <= (others => '1');`, 'end generate;'],
  case: n => ['g: case P generate', ...Array.from({ length: n }, (_, i) => `  when ${i} => y <= to_unsigned(${val(i)}, 8);`), `  when others => y <= (others => '1');`, 'end generate;']
};
const design = {
  verilog: (body, p = N - 1) => `module chain #(parameter P = ${p}) (output [7:0] y);\n${body.join('\n')}\nendmodule\n`,
  vhdl: (body, p = N - 1) => `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\nentity chain is\n  generic (P : integer := ${p});\n  port (y : out unsigned(7 downto 0));\nend chain;\n\narchitecture rtl of chain is\nbegin\n${body.join('\n')}\nend rtl;\n`
};
const file = lang => (lang === 'vhdl' ? 'chain.vhd' : 'chain.v');

// a test bench: one instance of the chain per value of P, each one's y written
const tb = {
  verilog: () => ({ path: 'tb.v', text: `module tb;\n${PS.map((p, k) => `  wire [7:0] y${k};\n  chain #(.P(${p})) u${k}(.y(y${k}));`).join('\n')}\n  initial begin\n    #1;\n${PS.map((_, k) => `    $display("%0d", y${k});`).join('\n')}\n  end\nendmodule\n` }),
  vhdl: () => ({ path: 'tb.vhd', text: `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\nentity tb is end tb;\n\narchitecture sim of tb is\n${PS.map((_, k) => `  signal y${k} : unsigned(7 downto 0);`).join('\n')}\nbegin\n${PS.map((p, k) => `  u${k}: entity work.chain generic map (P => ${p}) port map (y => y${k});`).join('\n')}\n  process begin\n    wait for 1 ns;\n${PS.map((_, k) => `    report integer'image(to_integer(y${k}));`).join('\n')}\n    wait;\n  end process;\nend sim;\n` })
};

function checkSyntax(path, text) {
  const lib = compile([{ path, text }]);
  const d = elaborate(lib, 'chain');
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

for (const [lang, kinds] of [['verilog', VERILOG], ['vhdl', VHDL]]) {
  for (const [name, body] of Object.entries(kinds)) {
    test(`#3500 ${lang} ${name} generate of ${N} branches: checked with no warnings, simulated, its synthesis input, its hierarchy`, () => {
      const text = design[lang](body(N));
      assert.deepEqual(checkSyntax(file(lang), text), []);
      assert.deepEqual(run([{ path: file(lang), text }, tb[lang]()]), PS.map(p => String(ref(p))));
      const lib = compile([{ path: file(lang), text }]);
      // (the parsers' chain: one generate_if per branch, each the else of the one before)
      const chain = genChain(lib.modules.get('chain').items.find(it => it.kind === 'generate_if'));
      assert.equal(chain.length, N);
      assert.deepEqual([topCandidates(lib), implRoots(lib, { top: 'chain' })], [['chain'], ['chain']]);
      let items = 0;
      walkItems(lib.modules.get('chain').items, () => items++);
      assert.equal(items, 2 * N + 1);   // (each branch and its assignment, the else's)
      // (the chosen branch's assignment, at its line: the first branch's line, one line per branch after it)
      const first = (lang === 'vhdl' ? 12 : 2) + (name === 'case' ? 1 : 0);
      for (const p of [0, N - 1, N]) {
        const { text: v, warnings } = synthesisInput(elaborate(compile([{ path: file(lang), text: design[lang](body(N), p) }]), 'chain'));
        assert.deepEqual(warnings, []);
        const line = first + Math.min(p, N);
        assert.match(v, new RegExp(`// assign_${line} \\(${file(lang)}:${line}\\)\\n  always @\\* begin\\n    y <?= 8'h${ref(p).toString(16)};\\n  end\\nendmodule`), v);
      }
    });
  }
}

// the translations (#3501's, the other language's chain; VHDL-93's if generates, one per branch, the earlier
// branches' negation a constant of a block past LONG_CHAIN branches): checked with no warnings, simulated as the original
for (const [lang, kinds] of [['verilog', VERILOG], ['vhdl', VHDL]]) {
  for (const [name, body] of Object.entries(kinds)) {
    test(`#3500 ${lang} ${name} generate of ${N} branches translated, checked with no warnings, simulated as the original`, () => {
      const to = lang === 'vhdl' ? 'verilog' : 'vhdl';
      const tr = translateSource(design[lang](body(N)), { path: file(lang), to });
      assert.deepEqual(tr.errors, []);
      assert.deepEqual(checkSyntax(file(to), tr.text), []);
      assert.deepEqual(run([{ path: file(to), text: tr.text }, tb[to]()]), PS.map(p => String(ref(p))));
    });
  }
}

// Verilog to VHDL: a chain of LONG_CHAIN (16) branches as before (#3501), each one on the earlier ones' negation; one
// more, in a block of the constants of no branch up to k
test('#3500 Verilog to VHDL: a chain of more than 16 branches, its earlier branches\' negation a constant per branch', () => {
  const vhdlOf = n => translateSource(design.verilog(VERILOG.if(n)), { path: 'chain.v', to: 'vhdl' });
  const short = vhdlOf(15).text;   // (15 conditions and the else: 16 branches)
  assert.match(short, /\n    bx: if not \(P = 0\) and not \(P = 1\) and .* and not \(P = 14\) generate\n/);
  assert.doesNotMatch(short, /block|_none_/);
  const long = vhdlOf(16);
  assert.deepEqual(long.errors, []);
  const lines = long.text.split('\n');
  const at = lines.indexOf('    b0_chain: block');
  assert.deepEqual(lines.slice(at, at + 3), ['    b0_chain: block', '        constant b0_none_0 : boolean := not (P = 0);', '        constant b0_none_1 : boolean := b0_none_0 and not (P = 1);']);
  assert.ok(lines.includes('        b1: if b0_none_0 and (P = 1) generate'), long.text);
  assert.ok(lines.includes('        bx: if b0_none_15 generate'), long.text);
  assert.ok(lines.includes('    end block b0_chain;'), long.text);
  assert.deepEqual(checkSyntax('chain.vhd', long.text), []);
});

// a VHDL alternative's declarations and names: in the generate's scope, as the first alternative's
test('#3500 VHDL: an elsif or case alternative elaborates in its generate\'s scope (g.s), not one scope deeper per alternative before it', () => {
  const alt = n => `g: if P = 0 generate\n  signal s : unsigned(7 downto 0);\nbegin\n  s <= to_unsigned(0, 8); y <= s;\n${Array.from({ length: n - 1 }, (_, i) => `elsif P = ${i + 1} generate\n  signal s : unsigned(7 downto 0);\nbegin\n  s <= to_unsigned(${i + 1}, 8); y <= s;`).join('\n')}\nend generate;`.split('\n');
  const cas = n => ['g: case P generate', ...Array.from({ length: n }, (_, i) => `  when ${i} =>\n    signal s : unsigned(7 downto 0);\n  begin\n    s <= to_unsigned(${i}, 8); y <= s;\n  end;`), 'end generate;'];
  for (const body of [alt, cas]) {
    for (const p of [0, 2]) {
      const text = design.vhdl(body(3), p);
      assert.deepEqual(checkSyntax('chain.vhd', text), []);
      const d = elaborate(compile([{ path: 'chain.vhd', text }]), 'chain');
      assert.deepEqual(d.signals.map(s => s.name).filter(s => /\bs$/.test(s)), ['g.s']);
    }
  }
});
