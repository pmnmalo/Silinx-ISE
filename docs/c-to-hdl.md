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
  `<iostream>`, `<fstream>`, `<iomanip>`, `hls_stream.h`, `ap_axi_sdata.h` (Silinx HLS's own: `ap_axis<D, U, TI,
  TD>` and `ap_axiu<…>`, a beat's data, keep, strb, user, last, id and dest; a side channel of width 0 left out, #1662)
  and `hls_fir.h` (`hls::FIR`, below, #1942).
  The project's own headers (`#include "x.h"`)
  are read in place.
- The **top function**: the one named by `#pragma HLS TOP name=…`, else the file's last function
  that is not `main`. The other functions are inlined into it. `main()` is the test bench (C
  simulation, C/RTL co-simulation); it is never synthesized.
- `#define` constants and function-like macros of one expression; `#if`/`#ifdef` on them.
- `__SYNTHESIS__` is defined in synthesis, as Vitis HLS's (#1897): code under `#ifndef __SYNTHESIS__` runs only in the
  C simulation, even in the top function (a trace file of each call, as AMD's examples write), checked as the test
  bench's.
- The test bench's files (#1598, #1897): `FILE *` with `fopen` / `fprintf` / `fscanf` / `fgets` / `fclose`, a name
  made with `sprintf` / `snprintf`, and `system("diff [-w | -b | -B | --brief] a b")` comparing two files (any other
  command refused). The files are the project's, in memory (the browser edition too): those the test bench's strings
  name are read (`"tb_data/in.dat"`, a format's `"out_%03d.dat"`), never a file outside the project (a path out of
  it, absolute or through `..`, is refused with a message); the files it
  writes stay in memory (the Console lists them), the project's are not changed. A `FILE` in the synthesized code is
  refused.

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
| `float` (#1768), `double` (#1773) | 32, 64 (their IEEE-754 bits) | |

**`float` and `double` in hardware** (#1768, #1773): a synthesized function's floating-point variables, arguments,
arrays and results are their IEEE-754 bits (32- and 64-bit ports, as Vitis HLS's), and each operation (`+ - *`, the
comparisons, `?:`, `-x`, `!x`, the conversions to and from the integers and between float and double) is a circuit of
the soft-float library (core/c-softfloat.js: round to nearest even, subnormals, infinities, a quiet NaN), inlined where it
is: the hardware gives the C simulation's bits. C's usual conversions: a double operand, a double constant (`0.5`)
too, makes an operation a double's; write `0.5f` to keep it a float's. **A table computed at synthesis** (#1779): a call
of a function that only writes its arrays from constants (no argument read, no global but a constant, no call but
`math.h`'s), as `for (i…) t[i] = sin(…)`, is run by the C simulation at synthesis, its values the arrays' (a ROM), as
Vitis HLS computes one; `math.h` and a division of constants are folded the same way. Of other
values: a division (`/`), `sqrt` / `sqrtf` and `fabs` / `fabsf` are made (#1783), and `floor`, `ceil`, `trunc`,
`round`, `fmin`, `fmax`, `copysign` (and their `…f`) on the value's bits (#1843); the others not yet (#1761).

`ap_fixed<W, I, Q, O>` / `ap_ufixed` (`#include "ap_fixed.h"`, #1643) run in the C
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
  (`hls::stream<S>`, #1662): `write`, `<<`, `read()` in a declaration, an assignment or a `return`, `read(v)`, `>>`,
  `empty`, `full`, passed to a function, named by a pragma. The top's is one `ap_fifo` of the struct's words (#1668,
  below), a word a struct read or written; an `ap_axis`'s side channels are members of its words (`axis`'s ports of
  their own, `TDATA`, `TKEEP`…, are #1894's).
- **Arrays of streams** (#1739): `hls::stream<T> s[N]`, a parameter `s[N]` or `(&s)[N]`: each element a stream of its
  own (its ap_fifo ports `s_0_dout`…, a FIFO in a DATAFLOW region); `s[k]` by a constant that stream, `s[i]` by a
  variable the statement made for each element (an `if` on the index); the array passed whole, its elements; its
  pragmas each element's. A stream's name (`hls::stream<T> s("name")`) is accepted.
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
  (`S *`; indexed, `p[i].x`, `auto t = p[i];`, an array of structs, #1684), arrays of structs passed whole, returned by a function (its call a statement: `x = f(…);` or
  `S x = f(…);`).
- `enum` and `enum class`: their constants are constants, the type an `int`.
- The top function's struct arguments and result: **one port each** (#1628), as Vitis HLS aggregates them (UG1399,
  the Vivado IP flow): the members in their order, the first at the LSB, each its C size (`bool` and `char` 8 bits,
  `short` 16, an `ap_int<W>` 8, 16, 32, 64… bits), the padding bits 0 (`struct { short x; bool z; ap_int<5> w; }`
  is 32 bits: `x` bits 15–0, `z` bit 16, `w` bits 28–24). A struct read is an input `s`; written (by reference or
  address), `s_i`, `s_o` and `s_o_ap_vld`, its members not written given back as they were; returned, `ap_return`.
  A **stream or an array of structs** (or a pointer to structs indexed) is one `ap_fifo` / one `ap_memory` of words
  (#1668), as Vitis HLS aggregates them: the members in their order from the LSB, each of its bits (`compact=bit`,
  Vitis HLS's default here: a `bool` 1 bit), a member array's elements one after the other (`struct { int foo[3];
  ap_int<23> bar; }` is 119 bits). An element's word is read once while its index and the memory do not change, its
  members' reads its fields; its members' writes go into it and it is written whole (read first when some of its
  fields were not written). The co-simulation packs the test bench's words from the C's members.
  `#pragma HLS AGGREGATE variable=s compact=bit | byte | none | auto` chooses the packing (`byte`: each member whole
  bytes; `none`: its C size, as above; of a struct argument too); `#pragma HLS DISAGGREGATE variable=s` keeps a port,
  a stream or a memory per member (`s_x`, `s_y_address0`…). A struct with a stream in it is disaggregated, as Vitis
  HLS does.
- **Bit-fields** (#1896): a member `T m : W;` is a member of `W` bits (`ap_uint<W>`, `ap_int<W>` of a signed `T`),
  wrapped as C wraps it; an unnamed one (`T : W;`) is padding.
- **Unions** (#1896): a union is one word, an unsigned integer of its size (up to 64 bits), its members views of its
  bits laid out as GCC lays them out on x86: from the least significant bit; an integer at an offset of its own size;
  a bit-field after the one before it when it fits in a unit of its type, else at the next. `u.m` reads the member's
  bits (a `float` or a `double` member's as one, the same bits), `u.m = e` writes them, the others kept; a struct
  member's members, anonymous (`union { float f; uint32_t raw; struct { uint32_t mant : 23, bexp : 8, sign : 1; }; }`:
  `u.bexp`) or named (`u.s.m`); an array member's elements (`u.b[i]`). A union variable, parameter, pointer
  (`p->m`), array (`a[i].m`) or port is its word; `{ e }` is its first member's value. Not yet: a union of more than
  64 bits, a union inside a struct, `++` and `--` on a member, designated initializers.
- Not possible: pointers in a struct or a union, a pointer to a struct as a variable. Not yet: base classes; a static
  object or an array of objects whose constructor is not of constants.

## What can be synthesized (UG1399's rules)

1. The whole functionality in the top function and the functions it calls.
2. No system calls: `printf`, `fprintf`, `puts` are ignored by synthesis (a note); `malloc`, `free`,
   `exit`, file I/O, `time`, `rand` are refused.
3. Fixed sizes: no dynamic memory, no recursion (direct or through other functions). A loop whose count depends on
   its inputs is made, as Vitis HLS makes it (#1699): a state machine that runs until its condition is false, its
   latency unknown (a warning; `#pragma HLS LOOP_TRIPCOUNT max=` gives the report a bound).
4. Unambiguous: a pointer only to an argument, an array or a variable, no function pointers, no `goto`. Pointer
   arithmetic (#1599) as Vitis HLS takes it: `*(p + e)` is `p[e]`; a local pointer is set to an array, `&x`,
   `&a[i]` or `a + i` (`p = sel ? a : b` in an `if`), read as `*p` or `p[i]` and moved with `p += n` or `p++`:
   Silinx makes it the target it points to (a multiplexer of their elements when it has several; written only when
   it has one) and an offset. Vitis HLS's other forms (#1895): a local pointer passed to a function (its target
   passed; one target, not moved); a pointer cast to a narrower native integer type (`char *p = (char *)&a[i]`,
   read only: the bytes of `a`'s elements from their least significant, as on x86); a pointer to a pointer
   parameter of a function the top calls, resolved at compile time (each call passes `&q`, `q` a pointer; read
   through only, `**pp`); a pointer argument moved by arithmetic (`p += n`, `p++`, `p = p + n`), then indexed from
   its new base. A pointer compared, or one that does not resolve so, is refused, with the rule.
5. No undefined behaviour Silinx can see.

Each refused construct has its own message, at its line and column, saying what is not possible
and what to write instead.

## The module made

Names and behaviour as Vitis HLS makes them (UG1399, "Interface synthesis"):

| Source | Ports |
|---|---|
| (clock and reset) | `ap_clk`, `ap_rst` (active high, synchronous) — none for a combinational module (#1900) |
| the block protocol `ap_ctrl_hs` (default) | `ap_start` in; `ap_done`, `ap_idle`, `ap_ready` out |
| `#pragma HLS INTERFACE ap_ctrl_none port=return` | no block protocol ports (a sequential module: `ap_clk` and `ap_rst` only, running by itself, #1900) |
| the returned value | `ap_return` (its type's width) |
| a scalar argument `int a` | input `a` (`ap_none`) |
| a pointer argument only read | input `p` (`ap_none`) |
| a pointer argument only written | output `p` and `p_ap_vld` (`ap_vld`) |
| a pointer argument read and written | input `p_i`, output `p_o` and `p_o_ap_vld` (`ap_ovld`) |
| a struct argument (#1628) | one port of its members (above): read, input `s`; written, `s_i`, `s_o`, `s_o_ap_vld`; returned, `ap_return` |
| an array argument | `ap_memory`: `a_address0`, `a_ce0`, `a_we0`, `a_d0`, `a_q0`; one of two or more dimensions (`a[N][M]`, #1786) one memory of N*M words, `a[i][j]` at `i*M + j`; an array of structs one memory of its words (#1668) |
| an array argument with `#pragma HLS INTERFACE bram` (#1668) | a BRAM's port: `a_Addr_A` (32 bits, an address in bytes), `a_EN_A`, `a_WEN_A` (a write enable a byte), `a_Din_A`, `a_Dout_A` (its words a power of 2 of bytes), `a_Clk_A`, `a_Rst_A` |
| a pointer argument indexed (`p[i]`, `*(p + i)`, #1599), or passed to a function that indexes it (#1684) | `ap_memory`, its depth the INTERFACE pragma's `depth=` (else 1024, a warning); a pointer to structs one memory of their words (#1668), a pragma naming the struct applying to it |
| a stream argument, `hls::stream<T>` | `ap_fifo`: `s_dout`, `s_empty_n`, `s_read`; `s_din`, `s_full_n`, `s_write`; a stream of structs one of their words (#1668) |

Ports are `std_logic_vector(W-1 downto 0)` (VHDL) or `[W-1:0]` (Verilog), a 1-bit type a
`std_logic` / plain wire. The block protocol: `ap_start` starts a call; `ap_ready` says the inputs
are read and the next call may start; `ap_done` (one cycle) says the outputs and `ap_return` are
valid; `ap_idle` is 1 while no call runs.

An argument named as a reserved word of VHDL or Verilog (`in`, `out`, `signal`…), or as one of the names Vitis HLS
reserves (`pos`, `neg`, #1902), has its ports named `<name>_r` (`in_r_dout`, `pos_r`), with a warning, as Vitis HLS
names them.

A function with no `static` variable whose loops all have constant bounds (fully unrolled) is
**combinational**: with `ap_ctrl_hs`, `ap_done` and `ap_ready` follow `ap_start` and `ap_idle` is 1;
with `ap_ctrl_none`, only the data ports. Any other function (a loop whose count depends on its inputs, a
`static` or global variable) is a **sequential** module: a finite state machine with a datapath. Its code is cut
into basic blocks (what runs with no jump, its ifs and switches with no loop in them included), one state each,
run in one clock cycle; its variables are registers (a `static` or a global keeps its value between calls, its
initial value set at the reset); its loops, `break`, `continue` and `return` choose the next state. The arguments
are read when `ap_start` is 1 in the idle state; the call's last state has `ap_done` and `ap_ready` at 1 for one
cycle, `ap_return` valid; a pointer output's `_ap_vld` is 1 for one cycle after each write, its value then valid.
With `ap_ctrl_none` (#1900) a sequential function with a stream argument has only `ap_clk` and `ap_rst`: it runs by
itself, starting its next call when one is done (Vitis HLS's free-running kernel), and the co-simulation feeds its
streams and waits for each call's values; one with no stream keeps `ap_ctrl_hs`, with a warning (its calls could not
be told apart: Vitis HLS's co-simulation refuses it too).
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

### DATAFLOW (#1707)

`#pragma HLS DATAFLOW` in the top function, whose body is calls of functions and declarations of streams and
arrays, makes each call a **process** running at the same time as the others, as Vitis HLS does (UG1399,
Task-level parallelism): each callee is a module of its own, made as the top would be (its own machine and
`ap_ctrl_hs`; a callee called twice, two instances; a pointer argument the size of the array it is given). The
channels between them:

- a local `hls::stream` is a **FIFO**, one process writing it and one reading it; its depth is `#pragma HLS STREAM
  variable= depth=`'s, else `hls::stream<T, D>`'s `D`, else 2;
- a local array is a **buffer** (a block RAM) written by one process; the process reading it starts once its writer
  is done (ping-pong within a call);
- the top's arguments are passed to the process that uses them: a stream or an array to one process, a scalar to
  any (an argument of a call is an argument of the top, a constant, a local stream or array).

The top's `ap_ctrl_hs` starts every process once a call and is done when every one is. With `ap_ctrl_none` (and a
stream argument), or when every process is an `hls::task` (a data-driven top), the top has only `ap_clk` and
`ap_rst`, as Vitis HLS's (#1900): its processes start again once all are done. The C simulation runs the
calls in order; the co-simulation drives the top's ports as for any module, and when a call does not end it names
the streams that may be too shallow (a stream to a process that waits for its writer to be done, through a buffer,
must hold all a call writes). Not yet: a process giving back a value (a pointer output or a result), an argument of
the top shared by two processes, a channel with two writers or readers.

**`hls::split` and `hls::merge`** (`hls_np_channel.h`, #1743): `hls::split::round_robin<T, N, D> s;` (its processes
writing `s.in`, reading `s.out[i]`) and `hls::merge::round_robin<T, N, D> m;` (writing `m.in[i]`, reading `m.out`) are
FIFOs and a task of their own moving each value, a split's to its outputs in turn, a merge's from its inputs in turn.
`load_balance` (Vitis HLS's a free output, an input with data, in the schedule's order) is made as `round_robin`, with a
warning.

**`hls::task`** (`hls_task.h`, #1721): `hls_thread_local hls::task t(f, a…);` starts, once, a task running `f` again
and again while its inputs have values (`hls_thread_local` streams and tasks live across calls). The C simulation runs
the tasks whenever the test bench or the top would wait (a read of an empty stream, the end of a call of the top),
as Vitis HLS's threads would: an invocation of `f` that would read an empty stream is undone and run again later; an
`f` of the form `init; while (1) body` keeps its init's variables across its iterations. In hardware (#1719) each task
is a process running by itself (its `ap_start` 1: its machine starts again when done, its state kept across calls), its
`hls_thread_local` streams FIFOs; the top's `ap_done` does not wait for the tasks, and the co-simulation waits for the
values a call reads and writes (an input stream's values kept across calls: a task may read ahead of the C's).

### The FIR filter: `hls::FIR` (`hls_fir.h`, #1942)

Vitis HLS's FIR filter (the FIR Compiler, PG149), with Silinx's own C model and hardware:

```cpp
struct config1 : hls::ip_fir::params_t {
  static const unsigned num_coeffs = 7;
  static const unsigned coeff_sets = 3;
  static const unsigned input_length = 20;
  static const unsigned output_length = 10;
  static const unsigned filter_type = hls::ip_fir::decimation;
  static const unsigned decim_rate = 2;
  static constexpr double coeff_vec[21] = { … };   // (or declared here, defined after: const double config1::coeff_vec[21] = { … };)
};
void top(data_t in[20], out_t out[10], ap_uint<8> *config) {
  static hls::FIR<config1> fir1;   // (static, or at file scope: its delay line lives across calls)
  fir1.run(in, out, config);       // (run(in, out) with one set; arrays or hls::streams; a config stream)
}
```

- **The header**: Silinx's own `hls_fir.h` (core/cpp-headers.js, none of AMD's): `hls::ip_fir`'s constants, `hls::ip_fir::params_t`
  and `hls::FIR<CONFIG_T>::run`, the API UG1399 and PG149 describe; the compiler reads its constants and defaults from it.
- **The parameters**: `hls::ip_fir::params_t`'s fields and defaults, as UG1399 describes them (`input_width` 16,
  `input_fractional_bits` 0, `output_width` 24, `coeff_width` 16, `num_coeffs` 21, `coeff_sets` 1, `input_length` and
  `output_length` 21, `filter_type` `single_rate`, …); `config1::num_coeffs` may be used in the code. Silinx makes single
  rate, decimation and interpolation filters of an integer rate, one channel, coefficient sets chosen by the config
  argument (its value the set), `integer_coefficients` and `quantize_only`, `full_precision` and `truncate_lsbs`; the
  others (`reloadable`, `hilbert_filter`, `interpolated`, `fixed_fractional`, `num_channels` > 1, the rounding modes,
  unsigned data or coefficients, `half_band`, …) are refused, each named with why. The fields of the hardware's speed and
  structure (`filter_arch`, `optimization_goal`, `sample_period`, …) are taken: Silinx's structure is its own.
- **What it computes** (the C model, the C simulation's): each input taken in the parameters' format
  (`ap_fixed<input_width, input_width - input_fractional_bits>`), the sums in full precision (the fewest bits holding
  every sum of a phase's coefficients times inputs of the input's range: PG149's `input_width + ceil(log2(sum |h|))`),
  `truncate_lsbs` dropping the LSBs past `output_width`, then the output's type takes the value (an `ap_fixed`
  conversion). Decimation by D gives an output once each D inputs (at the D-th: the single rate's y[mD + D - 1]);
  interpolation by L gives L outputs an input (y[nL + p] = Σ h[p + kL] x[n − k]). A call reads `input_length` inputs
  and writes `output_length` outputs (`input_length` × L / D).
- **The hardware** (its own HDL, core/hls-fir-hdl.js): one multiply-accumulate (an 18×18 multiplier, its operands and
  product registered), the coefficients a ROM and the delay line a RAM (block RAMs when large enough), a state machine:
  each input read and written into the delay line, then a tap a cycle, the sum written out. Its ports are Vitis HLS's:
  an array's `ap_memory` with its two ports (`in_r_address0` … `in_r_we1`; the second unused), a stream's `ap_fifo`, the
  config an `ap_none` input (`config_r`). The top that runs it (its calls only, DATAFLOW or not) makes it a process of
  its own; in a top of other statements its C model is inlined. Its latency is Silinx's: (D + 1) + taps + 3 cycles an
  output for a decimator (dsp-fir-decimator: 132 cycles a call, Vitis HLS's FIR Compiler 32).

## Pragmas (`#pragma HLS …`)

| Pragma | In Silinx |
|---|---|
| `TOP name=` | the top function |
| `INTERFACE ap_ctrl_none / ap_ctrl_hs port=return` | the block protocol |
| `INTERFACE ap_none / ap_vld / ap_ovld / ap_memory / bram port=` | the argument's interface |
| `AGGREGATE variable= compact=` / `DISAGGREGATE variable=` (the top's, #1668) | a struct argument, a stream or an array of structs one port, stream or memory of its words, packed `compact=bit` (an array's or a stream's default), `byte`, `none` (a scalar struct's default) / a port, a stream or a memory per member |
| `INLINE` / `INLINE off` | every function is inlined (`off` is ignored, with a warning) |
| `LOOP_TRIPCOUNT min= max=` | the report's bound of a loop whose count depends on the inputs (its latency, else unknown) |
| `PIPELINE [II=]` / `PIPELINE off` (in a loop's body) | a sequential module's loop: an iteration a state (II=1: its condition, body and step in one clock cycle), its inner loops of constant count unrolled in it; one that accesses a memory or a stream: an iteration its accesses' states (below); a warning saying the II made when it is more than asked. `off`: not pipelined, not even automatically |
| `UNROLL` / `UNROLL factor=N` (in a loop's body) | whole: a loop of constant count run in the state it is in (no state of its own); `factor=N`: N iterations a state. A combinational module's loops are all unrolled |
| `ARRAY_PARTITION variable= type=complete` | the array's elements registers, whatever its size (not a memory); `block` / `cyclic` ignored with a warning |
| `DATAFLOW` (the top function's, #1707) | its calls processes running at once (below); a region of other statements: a warning, made sequential |
| `STREAM variable= depth=` | a DATAFLOW region's stream: its FIFO's depth (else `hls::stream<T, D>`'s D, else 2) |
| `STREAM` elsewhere, `LATENCY`, `BIND_OP`, `BIND_STORAGE`, `DEPENDENCE`, `LOOP_FLATTEN`, … and AXI interfaces (`s_axilite`, `m_axi`, `axis`) | accepted and ignored, with a warning; an unknown pragma: a warning |

A loop's pragma is its body's first statements; one elsewhere is ignored with a warning (a function's `PIPELINE`
too).

**Loops pipelined automatically** (#1919), as Vitis HLS's default (UG1399): with no `PIPELINE` pragma, an innermost
loop of more than 64 iterations is pipelined (II=1 aimed at); one of 64 or fewer has its parent pipelined instead,
the inner loop unrolled in it, when Silinx can make the parent so (else the inner loop is pipelined); an innermost
loop with no parent is pipelined whatever its count. The threshold is Vitis HLS's `syn.compile.pipeline_loops`:
`cToHdl(…, { pipelineLoops: N })` (and `cosimulate`'s), 0 for none; `#pragma HLS PIPELINE off` in a loop leaves it
as it is. A pipelined loop that accesses a memory or a stream keeps a state per access (a memory's read is in its
register a cycle later), its condition and step in its last state, consecutive states merged when they use no port
of the same memory or stream; its first state's work is done in its last for the next iteration when they share no
port: `s += a[i]` takes a cycle an iteration, `a[i] = a[i] + 1` two (one port). A state that waits for a stream
writes nothing while it waits. Where the II of 1 is not met, a warning gives the II made and why: a memory's accesses
a state each, or a loop that cannot be made so (a branch or a `break` around an access, a `do`-while, an inner loop
that cannot be unrolled), then made as before. The generation's report (`cToHdl(…).report`) gives a sequential module's states, register bits, memories
and, for each loop, what its pragmas made: its II (states an iteration) and its cycles.
Only one state runs in a cycle, so the multiplications of different states share their units (#2125), as Vitis HLS
binds its operations: a state's multiplications take the first free units of their kind (one multiplier block, 18 x 18
at the operands' own widths, or the same widths), the units' operands multiplexed by the state; a multiplication by a
power of 2, or with an operand under 6 bits, keeps its own; so does one after another multiplication in its state, and
the uses of a kind whose unit's path (the latest operands of its uses, the multiplexers, the longest path after any of
them) has no room in the period: the latency is the schedule's, never longer. The soft-float's operations share their multiplications so.
With the device's multiplier blocks known (the IDE gives them: a Spartan-3E's MULT18X18s, a Spartan-6's DSP48A1s;
`cToHdl(…, { mults: N })`), a cycle takes no more than that many, every multiplication made of 18 x 18 ones: the
others wait for a later cycle (`pow` in double on a Basys2-100's 4). The report's `units` give each unit's widths, its
blocks, its uses and its inputs, `blocks` their sum and `unitsNs` the longest path with their multiplexers; the View
C Synthesis Report lists them, and warns when that path is over the clock (no registers are added on them yet).

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
