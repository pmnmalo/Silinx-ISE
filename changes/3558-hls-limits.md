In short:

- **Silinx HLS: limits with one error each.** A C source with a huge array, an expression of thousands of terms, deep
  nesting or a macro that blows up is refused with one error where it happens; it took minutes and gigabytes, or
  stopped the C simulation, the synthesis or Check Syntax with "Maximum call stack size exceeded".

In detail:

- **The limits of a C source (#3558, core/c-limits.js):**
  - an array of at most 2^22 elements, all its dimensions (`checkC`; a test bench's array of a size known when it runs
    and `malloc`'s in the C simulation): 100 million elements were accepted, the C simulation making an object per
    element (minutes, gigabytes); 2^22 is twice the bits of the largest device's block RAMs and 140 times the HLS
    corpus' largest array;
  - an array in the hardware (a memory of the module, core/c-mem.js; the values of a combinational module's array,
    core/c-dataflow.js) of at most 2^23 bits: its contents are written in the HDL word by word, an array of values
    is a value per element (a million ints took 2 GB, four million ran out of memory);
  - the parser's nesting (core/c-parse.js): parentheses, a call's arguments, indexes, `?:` and assignments at most 256
    levels deep, as the HDL's, and statements (blocks, `if` and `else if`, loops, `switch`) too; about 600 parentheses
    overflowed the parser; an `else if` chain past the limit is skipped with its `if`, one error;
  - an expression at most 1024 operators deep from its statement (a chain of a left-associative operator nests in its
    left operand: `x + x + …` of 10 000 terms overflowed the checks, the simulation and the synthesis): the deeper
    part replaced by 0 with one error per expression, the tree walked with a stack of its own;
  - a macro's expansion at most 65,536 tokens per macro the line names, macros nested at most 256 deep
    (core/c-lex.js): a macro doubling 16 times threw a RangeError (`out.push(...)` of its tokens) after a time
    doubling per level; its tokens are now pushed one by one;
  - what no limit catches (functions calling each other at the far end of long expressions, a type nested 20 000
    deep): the stack's overflow itself, one error of `checkC`, `simulateC` and `cToHdl` instead of a RangeError.
  - Statements nested in blocks took 2^depth in the synthesis (the floating-point units' scan of ALLOCATION pragmas,
    core/c-float-units.js, scanned each block again from every block around it): once each.
  The HLS corpus and the repository's C designs make the same HDL. Tests: test/c-limits.test.js (each limit at its
  value and one past it, the exact errors of the check, the C simulation and the synthesis in VHDL and Verilog, the
  ones accepted co-simulated in both), test/mcp-hls.test.js (c_simulation, c_synthesis_report, c_cosimulation and
  c_generated on three sources past the limits: their one error).
