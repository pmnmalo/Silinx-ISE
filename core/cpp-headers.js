// Silinx HLS C++ (#1662): the headers of Vitis HLS's that Silinx HLS writes itself, in the C++ it reads (read as a
// project's header would be, after the project's own of the same name). Isomorphic ES module.
//
// ap_axi_sdata.h: ap_axis<D, U, TI, TD> (signed data) and ap_axiu<…> (unsigned), an AXI4-Stream's beat and its side
// channels: keep and strb a bit per byte of data, user U bits, last, id TI bits, dest TD bits; a side channel of width
// 0 left out (core/c-struct.js), as AMD's header has none.
export const CPP_OWN_HEADERS = {
  'ap_axi_sdata.h': `#pragma once
#include "ap_int.h"
template <int D, int U, int TI, int TD> struct ap_axis {
  ap_int<D> data;
  ap_uint<(D + 7) / 8> keep;
  ap_uint<(D + 7) / 8> strb;
  ap_uint<U> user;
  ap_uint<1> last;
  ap_uint<TI> id;
  ap_uint<TD> dest;
};
template <int D, int U, int TI, int TD> struct ap_axiu {
  ap_uint<D> data;
  ap_uint<(D + 7) / 8> keep;
  ap_uint<(D + 7) / 8> strb;
  ap_uint<U> user;
  ap_uint<1> last;
  ap_uint<TI> id;
  ap_uint<TD> dest;
};
`,
};
