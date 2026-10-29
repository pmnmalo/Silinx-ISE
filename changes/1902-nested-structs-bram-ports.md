In detail:

- **Silinx HLS: the ports of an array of nested structs and the BRAM interface as Vitis HLS's (#1902):** an array
  argument with `#pragma HLS INTERFACE bram` has Vitis HLS's BRAM port (`_Addr_A`, an address in bytes of 32 bits,
  `_EN_A`, `_WEN_A` a write enable a byte, `_Din_A`, `_Dout_A`, its words a power of 2 of bytes, `_Clk_A`, `_Rst_A`);
  with the arrays of structs aggregated (#1668), interface-aggregation-disaggregation-aggregation-of-nested-structs
  now has Vitis HLS's ports, port by port (`a_address0`, `a_ce0`, `a_q0` of 104 bits, `b_q0` of 97, `c_Addr_A`… a
  BRAM of 128-bit words), no longer one memory per member (`a_p_address0`, `a_q_m_address0`…), and a latency of 43
  cycles instead of 83.
