In short:

- **Silinx HLS:** a function of thousands of states, as `pow` or `sin` in double, now co-simulates in VHDL.

In detail:

- **Silinx HLS: the VHDL's state machine is a `case` (#2272):** the clocked process of a sequential module tests its
  state with `case ap_CS_fsm is … when others`, as the Verilog's `case`, instead of one `if … elsif` per state, which
  nested as deep as the states: `pow` in double (5600 states) overflowed the stack of the VHDL simulator's parser, and
  `sin` (2200) of its elaborator under the test runner. Both co-simulate in VHDL and in Verilog.
