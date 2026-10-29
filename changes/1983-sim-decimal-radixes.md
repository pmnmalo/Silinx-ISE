In short:

- The simulator's decimal radixes are named by their encoding: Decimal (Unsigned), Decimal (Two's Complement), and a
  new Decimal (One's Complement).

In detail:

- **Simulator: the decimal radixes by their encoding, and one's complement (#1983):** the wave window's Radix menu
  shows Decimal (Unsigned) and Decimal (Two's Complement) (formerly Unsigned / Signed Decimal) and a new Decimal
  (One's Complement) (`c1dec`: 1110 = -1, 1111 = -0), in Portuguese Decimal (sem sinal / complemento para 2 /
  complemento para 1); the console's `show value` and `ssim force add` take `-radix c1dec`, a value typed in one's
  complement encoded as such. A .wcfg file has no ISE radix for it: the signal is written without one. Tests:
  test/web-helpers.test.js (every value on 1, 4 and 8 bits against the definition, shown and typed back),
  test/wcfg.test.js, test/web-isim-rows.test.js, test/ui/wave.test.js.
