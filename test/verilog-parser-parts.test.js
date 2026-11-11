// The parts of the Verilog parser (#405: out of core/verilog/parser.js): its definitions (parser-defs.js), its
// generate blocks, functions and instances (parser-items.js), statements (parser-stmts.js) and expressions
// (parser-exprs.js), methods of the parser's class: a module using each of them parses with no error into the items,
// declarations and expressions written; a damaged one gives each part's error and the parser goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../core/verilog/parser.js';
import { GATES, BIN_PREC, Sync } from '../core/verilog/parser-defs.js';
import { itemMethods } from '../core/verilog/parser-items.js';
import { stmtMethods } from '../core/verilog/parser-stmts.js';
import { exprMethods } from '../core/verilog/parser-exprs.js';

const SRC = `module sub(input a, output y); assign y = ~a; endmodule
module top #(parameter N = 4) (input clk, input [N-1:0] d, output reg [N-1:0] q, output w);
  genvar i;
  generate for (i = 0; i < N; i = i + 1) begin : g
    if (i == 0) begin : first and u (w, d[0], d[1]); end
  end endgenerate
  function [3:0] inc(input [3:0] x); inc = x + 1; endfunction
  task show; $display("q=%d", q); endtask
  sub s1 (.a(d[0]), .y());
  always @(posedge clk) begin
    case (d) 4'h0: q <= {2{2'b01}}; default: q <= d[3] ? inc(q) : q >> 1; endcase
    if (q == 0) show;
  end
endmodule`;

test('#405 Verilog parser parts: the definitions and the methods of each part', () => {
  assert.ok(GATES.has('nand') && BIN_PREC.length > 5 && new Sync() instanceof Error);
  assert.ok(['genBlock', 'genFor', 'funcDecl', 'instance', 'gateInst'].every(k => typeof itemMethods[k] === 'function'));
  assert.ok(['stmt', 'stmtInner', 'lvalue', 'hierName'].every(k => typeof stmtMethods[k] === 'function'));
  assert.deepEqual(Object.keys(exprMethods), ['expr', 'deeper', 'binary', 'unary', 'primary', 'postfix']);
});

test('#405 Verilog parser parts: generate, functions, tasks, instances, statements and expressions parsed with no error', () => {
  const r = parse(SRC, 't.v');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.units.map(u => u.name), ['sub', 'top']);
  const top = r.units[1];
  // the items: the generate loop (with its if and gate inside), the instance, the process
  assert.deepEqual(top.items.map(i => i.kind), ['generate_for', 'instance', 'process']);
  assert.ok(JSON.stringify(top.items[0]).includes('"generate_if"'));
  assert.ok(JSON.stringify(top.items[0]).includes('"gate":true'));
  // the function and the task among the declarations
  assert.ok(['inc', 'show'].every(n => JSON.stringify(top.decls).includes(`"${n}"`)));
  // the statements and the expressions of the process: case, if, a task call, a conditional, a call, a shift, a replication
  const proc = JSON.stringify(top.items[2]);
  for (const s of ['"case"', '"if"', '"inc"', '"show"', '">>"', '"op":"cond"', '"op":"repl"']) assert.ok(proc.includes(s), s);
});

test('#405 Verilog parser parts: a damaged statement and expression said, the parser going on to the next module', () => {
  const r = parse(`module a(input x, output reg y); always @* begin y = x +; end endmodule
module b(input x, output y); assign y = x; endmodule`, 'd.v');
  assert.deepEqual(r.errors.map(e => `${e.line}:${e.col} ${e.message}`), ["1:57 unexpected ';' in expression"]);
  assert.ok(r.units.some(u => u.name === 'b'), 'the next module parsed');
});
