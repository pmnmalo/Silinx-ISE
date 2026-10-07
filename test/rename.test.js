// Renaming a module/entity: only the references to the design unit change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renameModuleInSource, renameModuleInSchematic } from '../core/rename.js';

test('VHDL: entity, end, architecture-of, component, instances and entity work.X are renamed', () => {
  const src = `entity Knight is port (a : in bit); end Knight;
architecture rtl of knight is begin end architecture rtl;
entity top is end entity top;
architecture s of top is
  component knight port (a : in bit); end component knight;
  signal knight_en : bit;
begin
  u1 : knight port map (a => knight_en);
  u2 : entity work.KNIGHT port map (a => knight_en);
  knight : process begin wait; end process knight;
end s;`;
  const out = renameModuleInSource(src, 'vhdl', 'knight', 'light');
  assert.match(out, /entity light is port/);
  assert.match(out, /end light;/);
  assert.match(out, /architecture rtl of light is/);
  assert.match(out, /component light port/);
  assert.match(out, /end component light;/);
  assert.match(out, /u1 : light port map/);
  assert.match(out, /u2 : entity work\.light port map/);
  // not the design unit: kept
  assert.match(out, /signal knight_en/);
  assert.match(out, /knight : process begin wait; end process knight;/);
  assert.match(out, /entity top is end entity top;/);
});

test('Verilog: module declaration and instances are renamed, other identifiers are not', () => {
  const src = `module counter #(parameter N = 4) (input clk, output [N-1:0] q);
  reg [N-1:0] counter_r;
endmodule
module top(input clk);
  wire [3:0] q1, q2;
  counter #(.N(4)) u1 (.clk(clk), .q(q1));
  counter u2 (.clk(clk), .q(q2));
  wire counter;
endmodule`;
  const out = renameModuleInSource(src, 'verilog', 'counter', 'cnt');
  assert.match(out, /^module cnt #\(parameter N = 4\)/);
  assert.match(out, /cnt #\(\.N\(4\)\) u1/);
  assert.match(out, /cnt u2 \(/);
  assert.match(out, /reg \[N-1:0\] counter_r;/);
  assert.match(out, /wire counter;/);
});

test('unrelated sources are returned unchanged; schematic symbols follow the module', () => {
  const src = 'entity a is end a;';
  assert.equal(renameModuleInSource(src, 'vhdl', 'b', 'c'), src);
  const doc = { name: 'knight', symbols: [{ type: 'module', params: { module: 'Knight' } }, { type: 'and2', params: {} }] };
  assert.equal(renameModuleInSchematic(doc, 'knight', 'light', { linked: true }), true);
  assert.equal(doc.symbols[0].params.module, 'light');
  assert.equal(doc.name, 'light');
});
