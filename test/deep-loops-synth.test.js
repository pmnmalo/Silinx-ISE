// Nested loops through the synthesis input (#3504): markFirstWrites (packages/silinx-hdl/src/synth-verilog.js, the
// assignments no other write to their signal precedes, #523) walked a loop's body twice, each nested loop's twice per
// walk of the enclosing one: 2^n walks of the innermost statement for n nested loops (49 ms at 18 levels, 50 levels did
// not finish). It walks the body once (the second walk marked nothing more). Loops of one turn nested 10, 50 and
// MAX_NESTING levels deep (the innermost statement's level, #3490) in VHDL and Verilog: the synthesis input in a child
// process with a time limit (a slow one cannot be stopped in this one), its loops and no warnings; the design of 10
// levels and three loops of two turns (a count of a's ones) synthesized with no warnings, their netlists simulated
// against the designs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compile, elaborate } from '../core/compile.js';
import { synthesisInput } from '../core/synth-front.js';
import { MAX_NESTING } from '../packages/silinx-hdl/src/util.js';
import { diffSynth } from './diff-synth.js';

const LIMIT = 30000;   // (ms: the child's time; linear, 256 levels take about 50 ms)

// y <= a + 1 in n nested loops of one turn (the process level 1, the loops 2 … n + 1, the assignment n + 2)
function nested(lang, n) {
  const ks = [...Array(n).keys()];
  if (lang === 'vhdl') return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity nest is port (a : in unsigned(7 downto 0); y : out unsigned(7 downto 0)); end nest;

architecture rtl of nest is
begin
  process (a) begin
    y <= (others => '0');
${ks.map(k => `    for i${k} in 0 to 0 loop`).join('\n')}
    y <= a + 1;
${ks.map(() => '    end loop;').join('\n')}
  end process;
end rtl;
`;
  return `module nest(input [7:0] a, output reg [7:0] y);
${ks.map(k => `  integer i${k};`).join('\n')}
  always @* begin
    y = 0;
${ks.map(k => `    for (i${k} = 0; i${k} < 1; i${k} = i${k} + 1)`).join('\n')}
    y = a + 1;
  end
endmodule
`;
}

// the number of a's ones, in three nested loops of two turns
function ones(lang) {
  if (lang === 'vhdl') return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity nest is port (a : in std_logic_vector(7 downto 0); y : out unsigned(3 downto 0)); end nest;

architecture rtl of nest is
begin
  process (a)
    variable n : unsigned(3 downto 0);
  begin
    n := (others => '0');
    for i in 0 to 1 loop
      for j in 0 to 1 loop
        for k in 0 to 1 loop
          if a(i * 4 + j * 2 + k) = '1' then n := n + 1; end if;
        end loop;
      end loop;
    end loop;
    y <= n;
  end process;
end rtl;
`;
  return `module nest(input [7:0] a, output reg [3:0] y);
  integer i, j, k;
  always @* begin
    y = 0;
    for (i = 0; i < 2; i = i + 1)
      for (j = 0; j < 2; j = j + 1)
        for (k = 0; k < 2; k = k + 1)
          if (a[i * 4 + j * 2 + k]) y = y + 1;
  end
endmodule
`;
}

const file = lang => (lang === 'vhdl' ? 'nest.vhd' : 'nest.v');

// the synthesis input of a design in a child process: { ms, warnings, loops (its for statements) }, or its status
const CHILD = `
import { compile, elaborate } from ${JSON.stringify(new URL('../core/compile.js', import.meta.url).href)};
import { synthesisInput } from ${JSON.stringify(new URL('../core/synth-front.js', import.meta.url).href)};
import { readFileSync } from 'node:fs';
const { path, text } = JSON.parse(readFileSync(0, 'utf8'));
const lib = compile([{ path, text }]);
const t = performance.now();
const r = synthesisInput(elaborate(lib, 'nest'));
const ms = performance.now() - t;
console.log(JSON.stringify({ errors: lib.errors.map(e => e.message), ms, warnings: r.warnings, loops: (r.text.match(/^ *for \\(/gm) || []).length }));
`;
function childInput(lang, n) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], { input: JSON.stringify({ path: file(lang), text: nested(lang, n) }), encoding: 'utf8', timeout: LIMIT, maxBuffer: 1 << 20 });
  assert.equal(r.error?.code, undefined, `${lang} ${n} levels: not done in ${LIMIT} ms`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

for (const lang of ['vhdl', 'verilog']) {
  for (const n of [10, 50, MAX_NESTING - 2]) {
    test(`#3504 ${lang}: the synthesis input of loops nested ${n + 2} levels deep, in a time linear in their depth, with no warnings`, () => {
      const r = childInput(lang, n);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.warnings, []);
      assert.equal(r.loops, n);
      assert.ok(r.ms < LIMIT / 3, `${r.ms} ms`);
    });
  }

  test(`#3504 ${lang}: the synthesis input of 10 nested loops writes each once, the assignment in the innermost`, () => {
    const lib = compile([{ path: file(lang), text: nested(lang, 10) }]);
    assert.deepEqual(lib.errors, []);
    const { text, warnings } = synthesisInput(elaborate(lib, 'nest'));
    assert.deepEqual(warnings, []);
    const lines = text.split('\n');
    const fors = lines.filter(l => /^ *for \(/.test(l));
    assert.equal(fors.length, 10);
    // (each loop one level in its enclosing one: 2 or 4 spaces more, the VHDL loops' bodies in their flags' if)
    const ind = l => l.match(/^ */)[0].length;
    for (let k = 1; k < 10; k++) assert.ok(ind(fors[k]) > ind(fors[k - 1]), fors[k]);
    const inner = lines.findIndex(l => /^ *y <?= .*\ba\b/.test(l));
    assert.ok(inner > lines.indexOf(fors[9]) && ind(lines[inner]) > ind(fors[9]), lines[inner]);
  });

  for (const [name, text] of [['10 nested loops of one turn', nested(lang, 10)], ['three nested loops of two turns', ones(lang)]]) {
    test(`#3504 ${lang}: ${name} synthesized with no warnings, the netlist the design`, { timeout: 600000 }, async () => {
      const r = await diffSynth({ name: `loops-${lang}`, sources: [{ path: file(lang), text }], top: 'nest', sim: { cycles: 300 } });
      assert.equal(r.status, 'pass', r.report || r.reason);
      assert.deepEqual(r.warnings, []);
    });
  }
}
