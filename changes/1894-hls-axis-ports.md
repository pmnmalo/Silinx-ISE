In short:

- **Silinx HLS `axis` ports:** as Vitis HLS makes them: `X_TDATA`, `X_TVALID`, `X_TREADY`, the side channels of
  `ap_axis` / `ap_axiu`, and `ap_rst_n`.

In detail:

- **Silinx HLS: AXI4-Stream ports (#1894):** a top's stream with `#pragma HLS INTERFACE axis`, or of `ap_axis` /
  `ap_axiu` / `hls::axis_user`, is an AXI4-Stream port with Vitis HLS's names and side channels; an array with the
  pragma too, when read or written once in a loop over all of it (else its memory, with a warning); the design's reset
  is then `ap_rst_n`. The state machine is a module `<top>_core` under the top's. The five corpus designs have Vitis
  HLS's ports, co-simulated in VHDL and Verilog; DATAFLOW and `hls::FIR` tops keep their `ap_fifo`, with a warning.
