In detail:

- **A write-back after an earlier turn of a loop (#3512):** `x <= c ? v : x` is written `if (c) x <= v` in the
  synthesis input only when no earlier write of the process run can have written x's bits, an earlier turn of a loop
  included (src/synth-verilog.js `firstWritesOf`: what is written tracked by part, the whole signal, constant bits, or
  the element at the loop's own variable). Its first turn alone was checked: a wrong netlist when c was false.
