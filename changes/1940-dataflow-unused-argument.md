In short:

- **Silinx HLS:** a DATAFLOW region no longer drops the port of a top's scalar argument it does not read.

In detail:

- **A DATAFLOW top keeps every scalar argument's port (#1940):** `core/c-processes.js` made a port only for an argument a
  process read; a scalar no process reads now has its input port, as in Vitis HLS and in a top without DATAFLOW, also
  when the top calls the region with a constant in its place. A pointer no process uses still has none, as in a top
  without DATAFLOW. Tests: test/c-dataflow-call.test.js, co-simulated in VHDL and Verilog.
