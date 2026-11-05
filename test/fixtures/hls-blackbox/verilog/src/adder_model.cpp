// the C model of the RTL blackbox adder (adder.json): what the C simulation runs in place of the module
#include "ap_int.h"
typedef ap_uint<8> data_t;

void adder(data_t a, data_t b, data_t &z) { z = a + b; }
