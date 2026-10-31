In short:
- Silinx HLS: `#pragma HLS INTERFACE s_axilite` makes an AXI4-Lite slave, as Vitis HLS does.

In detail:
- Silinx HLS: `#pragma HLS INTERFACE s_axilite`: the function's module inside one with Vitis HLS's ports (`s_axi_<bundle>_*`, `ap_rst_n`, `interrupt`) and registers (the block's control, the interrupts, the arguments from 0x10 or at `offset=`); the co-simulation drives it through a model of the bus (#1893).
