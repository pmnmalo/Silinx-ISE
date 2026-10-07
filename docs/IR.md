# Silinx HDL Intermediate Representation (parser output)

Both front-ends (`core/verilog/parser.js`, `core/vhdl/parser.js`) export

```js
export function parse(source, file = 'input') // -> { file, lang, units: Unit[], errors: Diag[] }
```

`Diag = { file, line, col, message, severity: 'error'|'warning' }`. Parsers must never
throw on user input: they record an error and recover (skip to next `;` / `end`) where
possible. All nodes are plain JSON-serialisable objects (BigInt is NOT used in the IR;
large integers are kept as decimal strings in `value`). Every Item and Stmt carries
`loc: { line, col }` (1-based) and Module carries `file`.

Identifiers: Verilog keeps case. VHDL is case-insensitive, so the VHDL parser
**lower-cases every identifier** (names of signals, ports, types, entities, labels,
enum literals, functions, attributes). String/char literal contents keep case.

## Units

```js
Module = {
  kind: 'module', name, lang: 'verilog'|'vhdl', file, loc,
  params: [{ name, type: TypeSpec|null, default: Expr|null, local: bool }],
  // Verilog parameter/localparam (localparam: local=true; they may also appear as decls 'const')
  // VHDL generics (local=false)
  ports: [{ name, dir: 'in'|'out'|'inout', type: TypeSpec, default: Expr|null, loc }],
  decls: Decl[],
  items: Item[],
  uses: string[],          // VHDL: names of *user* packages made visible (`use work.my_pkg.all` -> 'my_pkg')
  timescale: { unit: ps, precision: ps } | undefined   // Verilog only, numbers in picoseconds
}

Package = { kind: 'package', name, lang: 'vhdl', file, loc, decls: Decl[], uses: string[] }
// package body decls are merged into the same Package (function bodies come from the body).

// VHDL entity and architecture appearing in the same file are merged into one Module
// (if several architectures exist, the LAST one wins). An architecture whose entity is
// in another file is emitted as:
Architecture = { kind: 'architecture', name /*arch name*/, entity, lang:'vhdl', file, loc, decls, items, uses }
// and a lone entity as a Module with empty decls/items plus `entityOnly: true`.
```

## TypeSpec (unelaborated)

```js
{ kind: 'logic', range: Range|null, signed: bool }
    // Verilog wire/reg/logic [msb:lsb] (range null = 1 bit scalar)
    // VHDL std_logic/std_ulogic/bit (range null), std_logic_vector/bit_vector/unsigned (signed=false),
    //      signed (signed=true) — all with range from the index constraint.
{ kind: 'integer', range: Range|null }   // VHDL integer/natural/positive (natural => range 0..2^31-1 may be omitted), Verilog integer
{ kind: 'boolean' }
{ kind: 'real' } | { kind: 'time' } | { kind: 'string' }
{ kind: 'named', name }                  // reference to a user type/subtype (VHDL)
{ kind: 'enum', values: string[] }       // only inside a 'type' Decl
{ kind: 'array', range: Range, elem: TypeSpec }
    // VHDL `type ram_t is array (0 to 255) of std_logic_vector(7 downto 0)`
    // Verilog memory `reg [7:0] mem [0:255]` -> array{range 0..255, elem logic[7:0]}
    // unconstrained VHDL array type `array (natural range <>) of ...` -> range: null

Range = { left: Expr, right: Expr, dir: 'downto'|'to'|null }
    // Verilog [a:b] -> dir null (direction decided by values; left is always the MSB side)
    // VHDL `x'range` / `x'reverse_range` -> { of: Expr, reverse: bool }
```

`std_logic_vector(7 downto 0)`: left=7, right=0, dir='downto'. Index `i` maps to bit position
`dir==='downto' ? i-right : right-i` (MSB is always `left`). Same rule for Verilog `[msb:lsb]`.

## Declarations

```js
{ kind: 'signal', name, type: TypeSpec, init: Expr|null, net: 'wire'|'reg'|'signal'|'variable', loc }
    // Verilog wire/reg/integer/logic; VHDL signal (net 'signal') and process/function variables ('variable')
{ kind: 'const', name, type: TypeSpec|null, value: Expr, loc }    // VHDL constant
{ kind: 'type', name, type: TypeSpec, loc }                       // VHDL type / subtype
{ kind: 'function', name, params: [{ name, type, dir:'in'|'out'|'inout' }], returnType: TypeSpec|null,
  decls: Decl[], body: Stmt[], retVar: string|undefined, loc }
    // Verilog: result assigned to function name -> retVar = name. VHDL: uses 'return' stmt.
    // VHDL procedures: returnType null. Verilog tasks: same node, kind 'task'.
{ kind: 'task', ... same fields as function, returnType null }
```

VHDL `component` declarations, `attribute` declarations/specs and `alias` may be dropped.

## Concurrent items

```js
{ kind: 'assign', target: LExpr, value: Expr, delay: Expr|null, loc }
    // Verilog `assign a = b;`  VHDL `a <= b;` (concurrent).
    // VHDL `a <= x when c1 else y when c2 else z;` -> value = cond(c1, x, cond(c2, y, z))
{ kind: 'process', label: string|null,
  sens: null | 'all' | [{ edge: 'pos'|'neg'|'any', expr: Expr }],
  initial: bool, decls: Decl[], body: Stmt[], loc }
    // Verilog `initial` -> sens null, initial true (runs once)
    // Verilog `always @(posedge clk or negedge rst)` -> sens list with edges
    // Verilog `always @*` / `always @(*)` / `always_comb` -> 'all'
    // Verilog `always` without event control (e.g. `always #5 clk = ~clk;`) -> sens null, initial false (loops)
    // VHDL `process (a, b)` -> sens [{edge:'any',expr:a},...]; `process (all)` -> 'all'
    // VHDL process without sensitivity list -> sens null, initial false (must contain wait)
    // VHDL selected assignment `with s select y <= a when "00", b when others;` -> desugar to
    //   process { sens:'all', body:[case] } with nonblocking assignments.
{ kind: 'instance', name, module, params: [{ name: string|null, value: Expr }],
  conns: [{ port: string|null, expr: Expr|null }], loc }
    // name null => positional. expr null => unconnected (`open`, `.p()`).
    // VHDL `u1: entity work.cnt port map(...)` and `u1: cnt port map(...)` -> module 'cnt'.
{ kind: 'generate_for', label, var, init: Expr, cond: Expr, step: Expr, decls: Decl[], items: Item[], loc }
    // Verilog `for (i=0; i<N; i=i+1) begin : lbl ... end` -> init 0, cond i<N, step `i+1` (the next value)
    // VHDL `lbl: for i in 0 to N-1 generate` -> init 0, cond (i <= N-1), step (i + 1); downto uses >= and -
{ kind: 'generate_if', label, cond: Expr, then: Item[], else: Item[], decls: Decl[], loc }
{ kind: 'decl', decl: Decl }   // only used inside generate bodies when needed
```

## Statements

```js
{ kind: 'block', label: string|null, decls: Decl[], stmts: Stmt[] }
{ kind: 'assign', target: LExpr, value: Expr, nonblocking: bool, delay: Expr|null }
    // Verilog `=` blocking (nonblocking false), `<=` nonblocking true.
    // VHDL signal `<=` -> nonblocking true; variable `:=` -> nonblocking false.
    // VHDL sequential `y <= a when c else b;` (2008) -> value cond(...).
    // `after 10 ns` / Verilog intra-assignment `a <= #2 b` -> delay.
{ kind: 'if', cond, then: Stmt, else: Stmt|null }               // elsif -> nested if in else
{ kind: 'case', expr, variant: 'case'|'casez'|'casex',
  items: [{ choices: (Expr | { range: Range })[], body: Stmt }], default: Stmt|null }
    // VHDL `when "00" | "01" =>`, `when 0 to 3 =>`, `when others =>` -> default
{ kind: 'for', init: Stmt, cond: Expr, step: Stmt, body: Stmt }  // Verilog C-style
{ kind: 'forrange', var, range: Range, body: Stmt }              // VHDL `for i in 0 to 7 loop`
{ kind: 'while', cond, body }  { kind: 'repeat', count, body }  { kind: 'forever', body }
    // VHDL plain `loop ... end loop` -> forever
{ kind: 'exit', cond: Expr|null }  { kind: 'next', cond: Expr|null }    // VHDL (labels ignored)
{ kind: 'delay', amount: Expr, stmt: Stmt|null }       // Verilog `#10 stmt;` (amount in module time units)
{ kind: 'event', events: 'all' | [{ edge, expr }], stmt: Stmt|null }   // Verilog `@(posedge clk) stmt;`
{ kind: 'wait', on: Expr[]|null, until: Expr|null, for: Expr|null, level: bool }
    // VHDL `wait;` -> all null (wait forever). `wait for 10 ns;` -> for. `wait until rising_edge(clk);`
    // `wait on a, b;`. Verilog `wait (cond) stmt` -> { until: cond, level: true } followed by stmt in a block.
{ kind: 'call', name, args: Expr[] }   // Verilog task / system task ($display, $finish, $readmemh...),
                                       // VHDL procedure call (e.g. `finish;`, `std.env.stop;` -> name 'finish'/'stop')
{ kind: 'report', message: Expr, severity: 'note'|'warning'|'error'|'failure' }
{ kind: 'assert', cond: Expr, message: Expr|null, severity: 'note'|'warning'|'error'|'failure' }
{ kind: 'return', value: Expr|null }
{ kind: 'null' }
```

## Expressions

```js
{ op: 'lit', bits: '0101xz', signed: false, sized: true, scalar?: true }
    // bits MSB first, chars in 0 1 x z (VHDL 'U','X','W','-' -> 'x'; 'Z' -> 'z'; 'L' -> '0'; 'H' -> '1').
    // Verilog 8'hFF, 4'b10x1, 'b1; VHDL "0101", x"FF", b"..", o"..", '1' (scalar: true).
    // Verilog unsized based literal 'hFF -> sized false (width = max(32, needed)).
{ op: 'int', value: '123' }          // plain decimal integer (Verilog unsized decimal, VHDL integer literal, 16#FF#)
{ op: 'real', value: 1.5 }
{ op: 'phys', value: 10, unit: 'fs'|'ps'|'ns'|'us'|'ms'|'sec' }   // VHDL time literal `10 ns`
{ op: 'str', value: 'text' }
{ op: 'ref', name }                  // identifier (also VHDL enum literals, true/false, constants)
{ op: 'index', base: Expr, index: Expr }               // Verilog a[i]
{ op: 'slice', base: Expr, left: Expr, right: Expr }   // Verilog a[7:4]; VHDL a(7 downto 4)
{ op: 'pslice', base: Expr, start: Expr, width: Expr, dir: '+'|'-' }   // Verilog a[i +: 4]
{ op: 'apply', name, args: (Expr | { named: string, value: Expr })[] }
    // VHDL name(args): array index, function call, or type conversion — resolved by the elaborator.
    // e.g. a(3), to_unsigned(x, 8), std_logic_vector(c), rising_edge(clk), mem(to_integer(addr))
    // Chained: mem(i)(3) -> index of apply -> { op:'apply', name:'mem', ... } wrapped in { op:'index', ...}
{ op: 'call', name, args: Expr[] }   // Verilog function call or system function ($signed, $clog2, $time, $random...)
{ op: 'concat', parts: Expr[] }      // Verilog {a,b}; VHDL a & b
{ op: 'repl', count: Expr, value: Expr }               // Verilog {4{a}}
{ op: 'unary', o, a }
    // o: '~' (VHDL not), '!', '-', '+', 'abs', reductions '&' '|' '^' '~&' '~|' '~^'
{ op: 'binary', o, a, b }
    // o: '+','-','*','/','%','mod','rem','**','&','|','^','~^','nand','nor',
    //    '<<','>>','<<<','>>>','==','!=','===','!==','<','<=','>','>=','&&','||'
    // VHDL: and/or/xor/xnor/nand/nor -> '&','|','^','~^','nand','nor'; '=' -> '=='; '/=' -> '!=';
    //       sll/srl -> '<<'/'>>'; sla/sra -> '<<<'/'>>>'; mod/rem kept; '&' is concat (see above).
{ op: 'cond', cond, then, else }
{ op: 'attr', prefix: Expr, attr: string, args: Expr[] }
    // VHDL x'event, x'length, x'high, x'low, x'left, x'right, x'range, integer'image(v) (prefix ref 'integer')
{ op: 'aggregate', items: [{ choices: (Expr | { range: Range } | 'others')[] | null, value: Expr }] }
    // VHDL (others => '0'), (0 => '1', others => '0'), (a, b) positional (choices null)
{ op: 'qualified', type: string, expr: Expr }   // VHDL unsigned'("0101")
```

LExpr (assignment targets): `ref`, `index`, `slice`, `pslice`, `apply` (VHDL a(i) / a(3 downto 0)
written as slice), `concat` (Verilog `{c, s} = a + b;`), VHDL aggregate target is not supported.

## Supported libraries (VHDL)

`library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;` plus the legacy
`std_logic_unsigned` / `std_logic_arith` are accepted silently (not listed in `uses`).
The elaborator provides built-ins: rising_edge, falling_edge, to_unsigned, to_signed, to_integer,
resize, std_logic_vector, unsigned, signed, conv_integer, conv_std_logic_vector, shift_left,
shift_right, to_stdlogicvector, now, finish/stop (std.env).
