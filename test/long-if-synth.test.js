// A long if … else if chain through the open synthesis (#3374): Yosys's front end nests an else if per branch and
// overflowed its stack from 250 branches ("memory access out of bounds"), its passes on the multiplexer chain
// (muxcover) from 1000. The synthesis input writes a chain of more than CHAIN_SPLIT branches as an if of its halves
// (splitChain). Its text (a chain of CHAIN_SPLIT as before; one more halved; 20 000 branches nested as deep as the log
// of their number); chains of 2000 branches in VHDL (elsif) and Verilog (else if), and a VHDL case of 100 ranges,
// synthesized with no warnings and their netlists simulated against the designs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesisInput } from '../core/synth-front.js';
import { CHAIN_SPLIT, splitChain } from '../packages/silinx-hdl/src/synth-stmts.js';
import { diffSynth } from './diff-synth.js';

const val = i => (i * 3) % 1000;   // (the value of branch i)

// y <= val(cnt) for cnt < n, all ones otherwise: an if … elsif / else if chain of n branches (clocked); cnt of 11 bits,
// so that a random cnt takes most branches of a chain of 2000
function vhdl(n) {
  const lines = ['if cnt = 0 then y <= to_unsigned(0, 10);'];
  for (let i = 1; i < n; i++) lines.push(`elsif cnt = ${i} then y <= to_unsigned(${val(i)}, 10);`);
  lines.push('else y <= (others => \'1\');');
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity chain is
  port (clk : in std_logic; cnt : in unsigned(10 downto 0); y : out unsigned(9 downto 0));
end chain;

architecture rtl of chain is
begin
  process (clk) begin
    if rising_edge(clk) then
      ${lines.join('\n      ')}
      end if;
    end if;
  end process;
end rtl;
`;
}

function verilog(n) {
  const lines = ['if (cnt == 0) y <= 10\'d0;'];
  for (let i = 1; i < n; i++) lines.push(`else if (cnt == ${i}) y <= 10'd${val(i)};`);
  lines.push('else y <= 10\'h3ff;');
  return `module chain(input clk, input [10:0] cnt, output reg [9:0] y);
  always @(posedge clk) begin
    ${lines.join('\n    ')}
  end
endmodule
`;
}

// a combinational case of n ranges (VHDL: an if chain of the ranges in the synthesis input): y <= the range's number
function vhdlRanges(n) {
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ranges is
  port (cnt : in unsigned(9 downto 0); y : out unsigned(7 downto 0));
end ranges;

architecture rtl of ranges is
begin
  process (cnt) begin
    case to_integer(cnt) is
${Array.from({ length: n }, (_, i) => `      when ${i * 3} to ${i * 3 + 2} => y <= to_unsigned(${i}, 8);`).join('\n')}
      when others => y <= (others => '1');
    end case;
  end process;
end rtl;
`;
}

const file = lang => (lang === 'vhdl' ? 'chain.vhd' : 'chain.v');
const make = (lang, n) => (lang === 'vhdl' ? vhdl(n) : verilog(n));
const input = (path, text, top) => {
  const lib = compile([{ path, text }]);
  assert.deepEqual(lib.errors, []);
  return synthesisInput(elaborate(lib, top));
};
const count = (text, re) => (text.match(re) || []).length;
// how deep the always block's ifs nest (its deepest line's indentation, two spaces a level)
const depth = text => Math.max(...text.split('\n').filter(l => /^ *(if|end else if) \(/.test(l)).map(l => l.match(/^ */)[0].length / 2));

test('#3374 splitChain: a chain of CHAIN_SPLIT branches as one, one more halved; the branches in their order, once each', () => {
  const calls = [];
  const chain = n => splitChain(Array.from({ length: n }, (_, i) => `c${i}`), Array.from({ length: n }, (_, i) => ind => { calls.push(i); return `${ind}b${i};\n`; }), ind => { calls.push('else'); return `${ind}e;\n`; }, '');
  const one = chain(CHAIN_SPLIT);
  assert.deepEqual(calls, [...Array(CHAIN_SPLIT).keys(), 'else']);
  assert.equal(count(one, /^end else if \(c\d+\) begin$/gm), CHAIN_SPLIT - 1);
  assert.ok(one.startsWith('if (c0) begin\n  b0;\nend else if (c1) begin\n'));
  assert.ok(one.endsWith(`end else if (c${CHAIN_SPLIT - 1}) begin\n  b${CHAIN_SPLIT - 1};\nend else begin\n  e;\nend\n`));
  calls.length = 0;
  const two = chain(CHAIN_SPLIT + 1);
  assert.deepEqual(calls, [...Array(CHAIN_SPLIT + 1).keys(), 'else']);
  const half = (CHAIN_SPLIT + 1) >> 1;
  assert.ok(two.startsWith(`if (|{${Array.from({ length: half }, (_, i) => `(c${i})`).join(', ')}}) begin\n  if (c0) begin\n    b0;\n`));
  // (the first half taken when one of its conditions is true: its last branch is its else, without its condition)
  assert.ok(two.includes(`  end else if (c${half - 2}) begin\n    b${half - 2};\n  end else begin\n    b${half - 1};\n  end\nend else begin\n  if (c${half}) begin\n`));
  assert.ok(!two.includes(`(c${half - 1}) begin`));
  assert.ok(two.endsWith(`  end else if (c${CHAIN_SPLIT}) begin\n    b${CHAIN_SPLIT};\n  end else begin\n    e;\n  end\nend\n`));
  // (without else: the last half's last branch keeps its condition)
  const noElse = splitChain(Array.from({ length: CHAIN_SPLIT + 1 }, (_, i) => `c${i}`), Array.from({ length: CHAIN_SPLIT + 1 }, (_, i) => ind => `${ind}b${i};\n`), null, '');
  assert.ok(noElse.endsWith(`  end else if (c${CHAIN_SPLIT}) begin\n    b${CHAIN_SPLIT};\n  end\nend\n`));
  assert.equal(splitChain(['a', 'b'], [i => `${i}x;\n`, i => `${i}y;\n`], null, '  '), '  if (a) begin\n    x;\n  end else if (b) begin\n    y;\n  end\n');
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#3374 ${lang}: the synthesis input of a chain of ${CHAIN_SPLIT} branches is one else if chain, of ${CHAIN_SPLIT + 1} two halves, of 20 000 nested as deep as their log`, () => {
    const one = input(file(lang), make(lang, CHAIN_SPLIT), 'chain');
    assert.deepEqual(one.warnings, []);
    assert.equal(count(one.text, /^ *end else if \(/gm), CHAIN_SPLIT - 1);
    assert.equal(count(one.text, /\|\{/g), 0);
    const two = input(file(lang), make(lang, CHAIN_SPLIT + 1), 'chain');
    assert.deepEqual(two.warnings, []);
    assert.equal(count(two.text, /^ *if \(\|\{/gm), 1);
    assert.equal(count(two.text, /^ *end else if \(/gm), CHAIN_SPLIT - 2);
    assert.equal(count(two.text, /^ *end else begin$/gm), 3);
    // (20 000: 1024 halves, those of 19 or 20 branches; the deepest if under the always block's and rising_edge's ifs, 10
    // levels of halves, an if and a begin each)
    const many = input(file(lang), make(lang, 20000), 'chain');
    assert.deepEqual(many.warnings, []);
    assert.equal(count(many.text, /^ *if \(\|\{/gm), 1023);
    assert.equal(count(many.text, /^ *end else if \(/gm), 20000 - 1024 - 1023);
    assert.ok(depth(many.text) <= 2 + 2 * 10 + 2, `${depth(many.text)}`);
  });

  test(`#3374 ${lang}: a chain of 2000 branches synthesized with no warnings, its netlist the design`, { timeout: 600000 }, async () => {
    const r = await diffSynth({ name: `chain-${lang}`, sources: [{ path: file(lang), text: make(lang, 2000) }], top: 'chain', sim: { cycles: 300 } });
    assert.equal(r.status, 'pass', r.report || r.reason);
    assert.deepEqual(r.warnings, []);
  });
}

test('#3374 VHDL: a case of 100 ranges (an if chain of the ranges) halved, synthesized with no warnings, its netlist the design', { timeout: 600000 }, async () => {
  const text = vhdlRanges(100);
  const { text: v, warnings } = input('ranges.vhd', text, 'ranges');
  assert.deepEqual(warnings, []);
  assert.equal(count(v, /^ *if \(\|\{/gm), 3);
  const r = await diffSynth({ name: 'ranges', sources: [{ path: 'ranges.vhd', text }], top: 'ranges', sim: { cycles: 300 } });
  assert.equal(r.status, 'pass', r.report || r.reason);
  assert.deepEqual(r.warnings, []);
});
