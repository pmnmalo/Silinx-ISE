In short:
- Silinx HLS: `#pragma HLS INTERFACE m_axi` makes an AXI4 master, as Vitis HLS does.

In detail:
- Silinx HLS: `#pragma HLS INTERFACE m_axi` (and a config's `syn.directive.interface … mode=m_axi`): an array, or a pointer indexed or read and written as `*p`, is read and written over an AXI4 master `m_axi_<bundle>_*`, its address an AXI4-Lite register (`offset=slave`), a port (`offset=direct`) or 0 (`offset=off`), the bus's width as Vitis HLS's; the module waits while an access is not done; the co-simulation drives it through a model of the bus; 14 corpus designs have Vitis HLS's ports (#1893).
