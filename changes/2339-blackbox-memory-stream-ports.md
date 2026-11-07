In short:

- **Silinx HLS's RTL blackbox, memories and streams:** a function replaced by a hand-written VHDL or Verilog module
  (syn.blackbox) may take an array, as a memory port (RAM_1P), and an `hls::stream`, as a FIFO port; C Simulation
  and C/RTL Co-simulation of a C source that calls a blackbox now take the C source's top function, not the C
  model's.

In detail:

- **An RTL blackbox's memory and stream ports (#2339):** a description's argument with `RAM_type` RAM_1P and Vitis
  HLS's keys (`RAM_address`, `RAM_clock_enable`, `RAM_write_enable`, `RAM_data_write_out`, `RAM_data_read_in`) is a
  memory port: the caller's memory (the top's ap_memory, or one of its own, a memory whatever its size) is the
  module's while the call's state waits for it, as a sub-module's; an argument with `FIFO_empty_flag`,
  `FIFO_read_enable`, `FIFO_data_read_in` (in) or `FIFO_full_flag`, `FIFO_write_enable`, `FIFO_data_write_out`
  (out) is a FIFO port, the caller's stream argument the module's. Checked against the C (an array of a known size,
  a stream, of integers) and the module (each port's direction and width, the address wide enough for the array's
  words); refused, saying what to correct: RAM_T2P (not yet), a port the direction does not need or one missing, an
  array partitioned, a BRAM interface or ram_2p written, a constant memory written. Tests: the top's memory, a memory
  of its own, the top's streams, a memory only read, against a Verilog and a VHDL module, co-simulated in VHDL and in
  Verilog and read by Check Syntax's design checks; a module that differs mismatches; the MCP's `c_simulation`,
  `c_cosimulation` and `c_synthesis_report`; the UI test in both interfaces.
- **C Simulation's top with an RTL blackbox (#2989):** the C models are added after the C source, and the top was
  the last function defined: with no top given (the interface's C Simulation and C/RTL Co-simulation, the MCP's), it
  was the C model's function, and the co-simulation failed. The top is now the C source's.
