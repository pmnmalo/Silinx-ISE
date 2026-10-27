In short:

- **Silinx HLS: `hls::stream` of a struct and `ap_axi_sdata.h`** (`ap_axis` / `ap_axiu`, an AXI4-Stream's beat and
  its side channels).

In detail:

- **Streams of structs and ap_axi_sdata.h (#1662):** core/c-struct-stream.js: `hls::stream<S>` a stream per member
  of `S`, written and read together (write, `<<`, `read()` in a declaration, an assignment or a return, `read(v)`,
  `>>`, empty, full, passed to a function, named by a pragma), a warning that Vitis HLS makes one stream of them
  (#1628); core/cpp-headers.js: Silinx HLS's own `ap_axi_sdata.h`, `ap_axis<D, U, TI, TD>` and `ap_axiu<…>` (a side
  channel of width 0 left out). `typedef S T;` of a struct or an enum already defined; an ap type's width written as
  a constant expression (`ap_uint<(D + 7) / 8>`). The C simulation as the C++ compiler's with AMD's ap_int.h, the
  co-simulation in VHDL and Verilog. One more of AMD's examples through co-simulation (24 of 73).
