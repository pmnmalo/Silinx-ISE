In short:

- **Smaller state machines in Verilog:** at Optimization Effort High, a Verilog state register written without an
  initial value may keep its own codes instead of one-hot, when that makes the design smaller or faster.

In detail:

- **State machines kept as written (#652):** the open synthesis at High tries the state machines that Yosys makes
  one-hot by itself in their author's codes too, and keeps the better netlist (secworks-aes 17 % fewer LUTs,
  secworks-sha1 15 % faster).
