# Silinx HLS: C and C++ to HDL (high-level synthesis)

A C function as a design source: Silinx turns it into a VHDL or Verilog module, as AMD's **Vitis HLS**
(formerly Vivado HLS, user guide UG1399) does for AMD's newer parts. The C file is the module's base;
its HDL is generated from it, read-only, as a drawing's is. The plan and its phases: issue #1532.

Silinx HLS is a **subset of what Vitis HLS accepts**: a source Silinx takes also goes through Vitis HLS
(as C++), with the same ports and the same behaviour at them. Vitis HLS does not target the
Spartan-3E, so it is not Silinx's oracle: the C itself is (see *Checking it* below).

## The source

- A `.c` file in C99, plus Vitis HLS's arbitrary precision integers (`#include "ap_int.h"`):
  `ap_int<W>` and `ap_uint<W>`, `W` from 1 to 1024; or a `.cpp` file in the C++ Vitis HLS synthesizes
  (see *C++* below).
- Known headers: `ap_int.h`, `stdint.h`, `stdbool.h`, `stdio.h`, `stdlib.h`, `string.h`, `math.h`,
  `stddef.h`, `limits.h` (the library for test benches, ignored by synthesis); in C++ their `<c…>` names,
  `<iostream>`, `<fstream>`, `<iomanip>`, `hls_stream.h` and `ap_axi_sdata.h` (Silinx HLS's own: `ap_axis<D, U, TI,
  TD>` and `ap_axiu<…>`, a beat's data, keep, strb, user, last, id and dest; a side channel of width 0 left out, #1662).
  The project's own headers (`#include "x.h"`)
  are read in place.
- The **top function**: the one named by `#pragma HLS TOP name=…`, else the file's last function
  that is not `main`. The other functions are inlined into it. `main()` is the test bench (C
  simulation, C/RTL co-simulation); it is never synthesized.
- `#define` constants and function-like macros of one expression; `#if`/`#ifdef` on them.

### Types

| C | Bits | Signed |
|---|---|---|
| `bool` | 1 | no |
| `char`, `signed char` / `unsigned char` | 8 | `char` signed (as `-fsigned-char`) |
| `short` / `unsigned short` | 16 | |
| `int` / `unsigned` | 32 | |
| `long`, `long long` and their unsigned | 64 | |
| `int8_t` … `int64_t`, `uint8_t` … `uint64_t` | as named | |
| `ap_int<W>` / `ap_uint<W>` | W | yes / no |

No floating point in hardware. `ap_fixed<W, I, Q, O>` / `ap_ufixed` (`#include "ap_fixed.h"`, #1643) run in the C
simulation as AMD's `ap_fixed.h` computes them: full-precision results, the quantization modes (`AP_TRN`,
`AP_TRN_ZERO`, `AP_RND`, `AP_RND_ZERO`, `AP_RND_MIN_INF`, `AP_RND_INF`, `AP_RND_CONV`) and overflow modes (`AP_WRAP`,
`AP_SAT`, `AP_SAT_ZERO`, `AP_SAT_SYM`) of a conversion, `to_double()`, `to_int()` (toward zero), `cout` of a value.
In hardware a fixed value is its raw bits: an operation aligns its operands' points with shifts in the type AMD gives
its result; a conversion drops bits with its quantization's rounding (an adder) and handles its overflow (a wrap a
truncation, a saturation two comparisons and a multiplexer). A `double` constant is only an `ap_fixed`'s value
(`a_t c = 0.25;`, a table of coefficients, a comparison `x < 1.5`). `x.range(hi, lo) = v` assigns those bits. The test bench may use
`float` and `double` (#1641): C's arithmetic and conversions, `math.h`, `printf`'s `%f` `%e` `%g` printed exactly as C's
library prints them, C++'s `cout` of a double (6 significant digits, or as `fixed`, `scientific`, `setprecision` set
the stream), `ap_int`'s `to_double()`. `const` is kept; `volatile`
is accepted on arguments and has no effect (as in Vitis HLS's default).

### Arithmetic

- C types follow C: the integer promotions and the usual arithmetic conversions, wrap-around on
  `unsigned`, signed overflow refused where Silinx can see it (it is undefined behaviour: the
  hardware would differ from the C).
- `ap_int` / `ap_uint` follow Vitis HLS: an operation's result is wide enough for any value of its
  operands (`a + b`: one bit more than the wider; `a * b`: the sum of the widths), then it is
  truncated (or sign-extended) when assigned. A C integer mixed with an `ap_int` takes its own width
  and signedness.
- Shifts by a negative or a too large amount, division by zero and reading an uninitialised
  variable are undefined behaviour: refused where Silinx can see it, else their result is not
  specified.

## C++ (`.cpp` sources)

The C above, plus the C++ Vitis HLS synthesizes (#1590). Each construct becomes C before the checks,
so its hardware is the C's:

- `namespace` and `using` (the names are the file's), qualified names (`std::cout`, `N::f`), `using T = …`,
  `constexpr`, `nullptr`, `static_cast` / `const_cast`, `static_assert`, `bool` / `true` / `false`.
- **References** as arguments (`int &y`): a pointer's ports (`y`, `y_ap_vld`; read and written `y_i`, `y_o`,
  `y_o_ap_vld`), as Vitis HLS makes them.
- **Templates**: function and class templates with integer and type parameters, their defaults, explicit
  specializations (`template <> struct S<1> { … }`), a type deduced from a call's arguments (from the type they
  are declared with). Each list of arguments is an instance with a name of its own (`adder<1, 4>` is
  `adder_1_4`), so `template <int K>` gives one copy, and one set of statics, per `K`. In an instance a pragma
  may use a parameter (`factor=N`), and `#pragma HLS if (cond) …` is kept only when `cond` holds.
- **Classes of static members** (a class template's too): their functions, constants and types are named by
  the class (`S::f`).
- **Member functions and constructors** of a struct or a class (a class template's too): each a function of the
  struct taking it by reference (`int S::get() const` is `int S_get(const S &)`), defined in the class or outside it
  (`int S::get() const { … }`); constructors with initializer lists, called where the object is declared
  (`S v(3);`, `S v;`); a default constructor of constants only gives the members their initial values (so a
  `static S v;` starts with them); `operator()` (`v(x)`); destructors do nothing.
- `auto x = e;` (the type `e` is declared with) and the **range for** over an array (`for (auto &x : a)`); over
  an array argument it is refused, as C++ does (the argument is a pointer).
- **`hls::stream<T>`** arguments: the `ap_fifo` interface (`_dout`, `_empty_n`, `_read`; `_din`, `_full_n`,
  `_write`), each access a state of its own that waits while the FIFO is empty or full. A **stream of a struct**
  (`hls::stream<S>`, #1662) is a stream per member of `S` (`A_data`, `A_last`…), all written or read together:
  `write`, `<<`, `read()` in a declaration, an assignment or a `return`, `read(v)`, `>>`, `empty`, `full`, passed to a
  function, named by a pragma. Vitis HLS makes one stream of them (a warning says so: not yet, #1628).
- Test benches: `std::cout` / `cerr` (with `<iomanip>`'s `setw`, `left` / `right`, `setfill('0')`, `hex` /
  `oct` / `dec`), `ofstream` / `ifstream` (files in memory), `>>` and `<<` on streams.
- Macros are expanded in pragmas (`#define F 4` … `#pragma HLS UNROLL factor=F`), as Vitis HLS does.

Not synthesizable, as in Vitis HLS: `new` / `delete`, exceptions, RTTI, virtual functions, recursion, the STL
(but the headers above). Not yet: operators other than `()`, base classes, `ap_fixed`, floating point.

## Structs and enums (C and C++)

A struct is **disaggregated**, as Vitis HLS does with the structs inside the code: each member is a variable of
its own, named by the variable and the member (`p.x` is `p_x`, `line[2].a.b` is `line_a_b[2]`); an array of
structs is an array per member; a member array of an array of structs is one array of both sizes (`a[i].v[j]` is
`a_v[i * 4 + j]`). So each member is a register, or a memory when its array is large, of its own.

- Definitions: `struct S { … };`, `typedef struct { … } S;`, `typedef S T;`, `class` (its data members); nested structs, member
  arrays, members' default values (`int n = 0;`).
- Uses: members (`.`, `->`), whole structs copied (`a = b;`, `S c = d;`), initializer lists (`{ … }`, nested or
  not, the missing members zero), passed to functions by value, by reference (`S &`, `const S &`) or by address
  (`S *`), arrays of structs passed whole, returned by a function (its call a statement: `x = f(…);` or
  `S x = f(…);`).
- `enum` and `enum class`: their constants are constants, the type an `int`.
- The top function's struct arguments and result: **one port per member** for now, with a warning. Vitis HLS
  aggregates them into one port (#1628).
- Not possible: unions, pointers in a struct, a pointer to a struct as a variable, bit fields (`ap_uint<W>`
  instead). Not yet: base classes; a static object or an array of objects whose constructor is not of constants.

## What can be synthesized (UG1399's rules)

1. The whole functionality in the top function and the functions it calls.
2. No system calls: `printf`, `fprintf`, `puts` are ignored by synthesis (a note); `malloc`, `free`,
   `exit`, file I/O, `time`, `rand` are refused.
3. Fixed or bounded sizes: no dynamic memory, no recursion (direct or through other functions),
   every loop with a bound Silinx can compute (a constant trip count, or `#pragma HLS
   LOOP_TRIPCOUNT max=` for a loop whose count depends on its inputs).
4. Unambiguous: a pointer only to an argument or to an array, never cast between types, no pointer
   arithmetic beyond indexing an array, no function pointers, no `goto`.
5. No undefined behaviour Silinx can see.

Each refused construct has its own message, at its line and column, saying what is not possible
and what to write instead.

## The module made

Names and behaviour as Vitis HLS makes them (UG1399, "Interface synthesis"):

| Source | Ports |
|---|---|
| (clock and reset) | `ap_clk`, `ap_rst` (active high, synchronous) — none for a combinational module |
| the block protocol `ap_ctrl_hs` (default) | `ap_start` in; `ap_done`, `ap_idle`, `ap_ready` out |
| `#pragma HLS INTERFACE ap_ctrl_none port=return` | no block protocol ports |
| the returned value | `ap_return` (its type's width) |
| a scalar argument `int a` | input `a` (`ap_none`) |
| a pointer argument only read | input `p` (`ap_none`) |
| a pointer argument only written | output `p` and `p_ap_vld` (`ap_vld`) |
| a pointer argument read and written | input `p_i`, output `p_o` and `p_o_ap_vld` (`ap_ovld`) |
| an array argument | `ap_memory`: `a_address0`, `a_ce0`, `a_we0`, `a_d0`, `a_q0` |

Ports are `std_logic_vector(W-1 downto 0)` (VHDL) or `[W-1:0]` (Verilog), a 1-bit type a
`std_logic` / plain wire. The block protocol: `ap_start` starts a call; `ap_ready` says the inputs
are read and the next call may start; `ap_done` (one cycle) says the outputs and `ap_return` are
valid; `ap_idle` is 1 while no call runs.

A function with no `static` variable whose loops all have constant bounds (fully unrolled) is
**combinational**: with `ap_ctrl_hs`, `ap_done` and `ap_ready` follow `ap_start` and `ap_idle` is 1;
with `ap_ctrl_none`, only the data ports. Any other function (a loop whose count depends on its inputs, a
`static` or global variable) is a **sequential** module: a finite state machine with a datapath. Its code is cut
into basic blocks (what runs with no jump, its ifs and switches with no loop in them included), one state each,
run in one clock cycle; its variables are registers (a `static` or a global keeps its value between calls, its
initial value set at the reset); its loops, `break`, `continue` and `return` choose the next state. The arguments
are read when `ap_start` is 1 in the idle state; the call's last state has `ap_done` and `ap_ready` at 1 for one
cycle, `ap_return` valid; a pointer output's `_ap_vld` is 1 for one cycle after each write, its value then valid.
A function with a loop called by the top, or given an array, is **inlined** into it (#1632): its loops are the
top's (each call its own), its array parameters the arguments (a memory too), its pointer and reference parameters
the variables passed, its by-value parameters local variables, its `static` variables one register per function
shared by every call; an early `return` ends it through a flag. Such a call in an expression is made before it;
in a loop's condition, or after `&&`, `||` or `?:`, it is refused. A division or remainder (#1656) by a constant
power of 2 is shifts, by another constant a multiplication by its reciprocal and a shift, by a variable a restoring
divider (one compare-and-subtract per bit, combinational: in one cycle); all written with + - * and comparisons, as
XST takes them. A division by zero gives every quotient bit 1 and the dividend as the remainder (the C simulation
stops on it). The machine shown as an ASM chart: #1575.

**Arrays and memories** (#1527). A local array of up to 64 elements is registers (one per element; an index that
is not a constant a multiplexer). An array argument is a memory outside the module, `ap_memory`: one port, its
address (`_address0`, enough bits for its size) and enable (`_ce0`), its write enable and data (`_we0`, `_d0`,
when it is written) and the value read (`_q0`, the cycle after its address, as a block RAM gives it); the module
is sequential. A local, `static` or global array of more than 64 elements, and a constant one in a sequential
module, is a memory inside it with the same port, written so that ISE and Yosys make it a block RAM: its
initial values its contents (a `const` array, or one never written, is a ROM); a `static` or global one keeps its
values between calls; one initialized with `{ … }` and written must be `static` (or initialized with a loop).
Each access takes a state: a statement reading a memory has a state per read (its address driven), then its own
(the values read in registers); a write is a statement of its own (`a[i] = v;`, `a[i] += v;`, `a[i]++;`), with no
other side effect in it; the index of a memory has no side effect; a memory is accessed in the top function only
(not passed to a function, not in a `switch`). A combinational function's constant arrays are LUT ROMs.

## Pragmas (`#pragma HLS …`)

| Pragma | In Silinx |
|---|---|
| `TOP name=` | the top function |
| `INTERFACE ap_ctrl_none / ap_ctrl_hs port=return` | the block protocol |
| `INTERFACE ap_none / ap_vld / ap_ovld / ap_memory port=` | the argument's interface |
| `INLINE` / `INLINE off` | every function is inlined (`off` is ignored, with a warning) |
| `LOOP_TRIPCOUNT min= max=` | the bound of a loop whose count depends on the inputs |
| `PIPELINE [II=]` (in a loop's body) | a sequential module's loop: an iteration a state (II=1: its condition, body and step in one clock cycle); a loop that accesses a memory, has a loop or a `continue` in it keeps its states, a warning saying the II made |
| `UNROLL` / `UNROLL factor=N` (in a loop's body) | whole: a loop of constant count run in the state it is in (no state of its own); `factor=N`: N iterations a state. A combinational module's loops are all unrolled |
| `ARRAY_PARTITION variable= type=complete` | the array's elements registers, whatever its size (not a memory); `block` / `cyclic` ignored with a warning |
| `DATAFLOW`, `STREAM`, `LATENCY`, `BIND_OP`, `BIND_STORAGE`, `DEPENDENCE`, `LOOP_FLATTEN`, … and AXI interfaces (`s_axilite`, `m_axi`, `axis`) | accepted and ignored, with a warning; an unknown pragma: a warning |

A loop's pragma is its body's first statements; one elsewhere is ignored with a warning (a function's `PIPELINE`
too). The generation's report (`cToHdl(…).report`) gives a sequential module's states, register bits, memories
and, for each loop, what its pragmas made: its II (states an iteration) and its cycles.

## HDL to C (the other way)

Any module of the project (VHDL, Verilog, or a drawing's generated HDL: a schematic, an ASM chart, a state diagram,
a truth table) has a **C model** (Processes ▸ View C Model, #1530): C99 computing what Silinx's simulator computes,
two-state (an unknown bit is 0): a struct of its signals (each of at most 64 bits, an array as an array of words)
and

```c
void top_init(top_t *s);   /* the signals at their initial values */
void top_eval(top_t *s);   /* the combinational logic settled, the inputs set first */
void top_step(top_t *s);   /* a sequential design: a rising edge of its clock, then top_eval */
```

The processes are C functions run in delta cycles (a VHDL signal or a Verilog nonblocking assignment takes its value
in the next one), the clocked ones once per `top_step`; the HDL functions are C functions. One clock and its rising
edges only; a wait with a time, file I/O, real values, more than 64 bits are said, not modelled. A C test bench sets
the inputs, calls `top_step` (or `top_eval`) and reads the outputs, as Silinx's tests do against the simulator.

## Checking it

- **Against the C**: the tests compile the C with the host's C compiler (gcc or clang,
  `-fsigned-char`), call it on random and edge inputs, and simulate the generated HDL (VHDL and
  Verilog) on the same calls: the same outputs, call by call.
- **Synthesis**: the generated HDL through ISE with no warnings, and through the Silinx toolchain on
  every supported device.
- **In the app**: C simulation (Silinx's interpreter of Silinx HLS runs `main()`) and C/RTL
  co-simulation (the test bench's calls drive the generated HDL) — phase 5 (#1528).

## The phases

0. This specification (#1523).
1. The C parser and its checks (#1524), and Check Syntax of a `.c` file.
2. Combinational C to HDL (#1525).
3. Sequential C, `ap_ctrl_hs` (#1526); its machine shown as an ASM chart (#1575).
4. Arrays and memories (#1527).
5. C simulation and co-simulation (#1528).
6. The pragmas (#1529).
7. HDL and state machines to C (#1530).
8. The interface: New Source, the C editor, the processes, an example (#1531).
