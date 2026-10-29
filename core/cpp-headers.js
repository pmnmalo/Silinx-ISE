// Silinx HLS C++ (#1662): the headers of Vitis HLS's that Silinx HLS writes itself, in the C++ it reads (read as a
// project's header would be, after the project's own of the same name). Isomorphic ES module.
//
// ap_axi_sdata.h: ap_axis<D, U, TI, TD> (signed data) and ap_axiu<…> (unsigned), an AXI4-Stream's beat and its side
// channels: keep and strb a bit per byte of data, user U bits, last, id TI bits, dest TD bits; a side channel of width
// 0 left out (core/c-struct.js), as AMD's header has none. hls::axis_user<WUser, EnableSignals, WId, WDest> (#1819): AMD's
// hls::axis with no data (nor keep, strb): its user, last when AXIS_ENABLE_LAST, id and dest; get_user, set_user.
//
// hls_fir.h (#1942): Silinx's own, of the API UG1399 and PG149 describe: hls::ip_fir's constants (each parameter's
// options), hls::ip_fir::params_t's fields and their defaults (a config struct derives from it and sets those it
// changes), hls::FIR<CONFIG_T> and its run(). Its constants and defaults are read from it (core/hls-fir.js); a source's
// filters made by core/cpp-fir.js, which takes its tokens out (its names stay hls::ip_fir's, never the source's).
export const CPP_OWN_HEADERS = {
  'hls_fir.h': `#pragma once
#include "ap_fixed.h"
namespace hls {
namespace ip_fir {
enum filter_type { single_rate = 0, interpolation = 1, decimation = 2, hilbert_filter = 3, interpolated = 4 };
enum rate_change_type { integer = 0, fixed_fractional = 1 };
enum rate_specification_type { frequency = 0, period = 1, input_period = 2, output_period = 3 };
enum quantization_type { integer_coefficients = 0, quantize_only = 1, maximize_dynamic_range = 2 };
enum coeff_structure_type { inferred = 0, non_symmetric = 1, symmetric = 2, negative_symmetric = 3, half_band = 4, hilbert = 5 };
enum output_rounding_mode_type { full_precision = 0, truncate_lsbs = 1, non_symmetric_rounding_to_zero = 2, non_symmetric_rounding_to_infinity = 3,
  symmetric_rounding_to_zero = 4, symmetric_rounding_to_infinity = 5, convergent_rounding_to_even = 6, convergent_rounding_to_odd = 7 };
enum filter_arch_type { systolic_multiply_accumulate = 0, transpose_multiply_accumulate = 1 };
enum optimization_goal_type { area = 0, speed = 1 };
enum config_sync_mode_type { on_vector = 0, on_packet = 1 };
enum config_method_type { single = 0, by_channel = 1 };
enum value_sign_type { value_signed = 0, value_unsigned = 1 };
struct params_t {
  static const unsigned input_width = 16;
  static const unsigned input_fractional_bits = 0;
  static const unsigned output_width = 24;
  static const unsigned output_fractional_bits = 0;
  static const unsigned coeff_width = 16;
  static const unsigned coeff_fractional_bits = 0;
  static const unsigned num_coeffs = 21;
  static const unsigned coeff_sets = 1;
  static const unsigned input_length = 21;
  static const unsigned output_length = 21;
  static const unsigned num_channels = 1;
  static const unsigned total_num_coeff = num_coeffs * coeff_sets;
  static const double coeff_vec[total_num_coeff];
  static const bool reloadable = false;
  static const unsigned filter_type = single_rate;
  static const unsigned rate_change = integer;
  static const unsigned interp_rate = 1;
  static const unsigned decim_rate = 1;
  static const unsigned zero_pack_factor = 1;
  static const unsigned rate_specification = period;
  static constexpr double hardware_oversampling_rate = 1;
  static constexpr double sample_period = 1;
  static constexpr double sample_frequency = 0.001;
  static const unsigned quantization = integer_coefficients;
  static const bool best_precision = false;
  static const unsigned coeff_structure = non_symmetric;
  static const unsigned output_rounding_mode = full_precision;
  static const unsigned filter_arch = systolic_multiply_accumulate;
  static const unsigned optimization_goal = area;
  static const unsigned inter_column_pipe_length = 4;
  static const unsigned column_config = 1;
  static const unsigned config_sync_mode = on_vector;
  static const unsigned config_method = single;
  static const unsigned coeff_padding = 0;
  static const unsigned num_paths = 1;
  static const unsigned data_sign = value_signed;
  static const unsigned coeff_sign = value_signed;
};
}
/* the filter: static hls::FIR<config> f; its run(in, out) or run(in, out, config), in and out arrays of
   input_length and output_length values or hls::streams, config a pointer, a value or a stream (its value the set) */
template <typename CONFIG_T> class FIR {
public:
  template <typename IN_T, typename OUT_T> void run(IN_T *in, OUT_T *out);
  template <typename IN_T, typename OUT_T, typename CONFIG> void run(IN_T *in, OUT_T *out, CONFIG *config);
};
}
`,
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
#define AXIS_ENABLE_DATA 0x01
#define AXIS_ENABLE_DEST 0x02
#define AXIS_ENABLE_ID 0x04
#define AXIS_ENABLE_KEEP 0x08
#define AXIS_ENABLE_LAST 0x10
#define AXIS_ENABLE_STRB 0x20
#define AXIS_ENABLE_USER 0x40
#define AXIS_ENABLE_SIDE_BAND 0x7e
#define AXIS_ENABLE_ALL 0x7f
/* (hls::axis_user: its namespace dropped, as the C++ Silinx reads takes a qualified name by its last part) */
template <int WU, int EN = AXIS_ENABLE_USER, int WI = 0, int WD = 0> struct axis_user {
  ap_uint<WU> user;
  ap_uint<(EN >> 4) & 1> last;
  ap_uint<WI> id;
  ap_uint<WD> dest;
  ap_uint<WU> get_user() const { return user; }
  void set_user(ap_uint<WU> v) { user = v; }
};
`,
};
