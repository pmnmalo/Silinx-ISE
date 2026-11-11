// Silinx - the parts of IEEE's math_real package (VHDL) that are written in VHDL. A design that
// uses ieee.math_real gets this package compiled with it (core/compile.js). The functions on reals
// (ceil, floor, round, trunc, sqrt, log2, log10, log, exp, sign, realmax, realmin) are built into
// the elaborator (core/elaborate.js bindBuiltin, core/interp.js mathReal); here are the constants and
// the procedure UNIFORM, the pseudo-random generator testbenches use: L'Ecuyer's combined
// multiplicative linear congruential generator (Communications of the ACM 31(6), 1988), the
// generator the standard specifies, written from the published algorithm.

export const usesMathReal = text => /\bmath_real\b/i.test(String(text || ''));

export const MATH_REAL_SOURCE = {
  path: '<silinx>/math_real.vhd',
  lang: 'vhdl',
  text: `package math_real is
  constant MATH_E : real := 2.71828182845904523536;
  constant MATH_1_OVER_E : real := 0.36787944117144233402;
  constant MATH_PI : real := 3.14159265358979323846;
  constant MATH_2_PI : real := 6.28318530717958647693;
  constant MATH_1_OVER_PI : real := 0.31830988618379067154;
  constant MATH_PI_OVER_2 : real := 1.57079632679489661923;
  constant MATH_PI_OVER_3 : real := 1.04719755119659774615;
  constant MATH_PI_OVER_4 : real := 0.78539816339744830962;
  constant MATH_3_PI_OVER_2 : real := 4.71238898038468985769;
  constant MATH_LOG_OF_2 : real := 0.69314718055994530942;
  constant MATH_LOG_OF_10 : real := 2.30258509299404568402;
  constant MATH_LOG2_OF_E : real := 1.44269504088896340736;
  constant MATH_LOG10_OF_E : real := 0.43429448190325182765;
  constant MATH_SQRT_2 : real := 1.41421356237309504880;
  constant MATH_1_OVER_SQRT_2 : real := 0.70710678118654752440;
  constant MATH_SQRT_PI : real := 1.77245385090551602730;
  constant MATH_DEG_TO_RAD : real := 0.01745329251994329577;
  constant MATH_RAD_TO_DEG : real := 57.29577951308232087680;
  procedure uniform(variable seed1, seed2 : inout positive; variable x : out real);
end package math_real;

package body math_real is
  procedure uniform(variable seed1, seed2 : inout positive; variable x : out real) is
    variable s1, s2, k, z : integer;
  begin
    s1 := seed1;
    s2 := seed2;
    k := s1 / 53668;
    s1 := 40014 * (s1 - k * 53668) - k * 12211;
    if s1 < 0 then s1 := s1 + 2147483563; end if;
    k := s2 / 52774;
    s2 := 40692 * (s2 - k * 52774) - k * 3791;
    if s2 < 0 then s2 := s2 + 2147483399; end if;
    z := s1 - s2;
    if z < 1 then z := z + 2147483562; end if;
    seed1 := s1;
    seed2 := s2;
    x := real(z) * 4.656613057E-10;
  end procedure uniform;
end package body math_real;
`,
};
