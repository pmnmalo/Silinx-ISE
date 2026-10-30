In detail:

- **Device measurements, the XC3S500E's open-flow designs (#3):** the `test/fixtures/open-flow` designs, retargeted to
  the Nexys2-500, measured with ISE: their observation and the clock tree's rounds (the clock column, the clock rows,
  the side buffers), every verdict agreeing with the shipped graph. The measured description's placer now reaches every
  slice and block RAM from every global buffer; 655 split nodes lose a route (932 before). All 43 designs routed by the
  open flow on it pass ISE (DRC 0 / 0, `.bit` byte-identical with CRC on and off). `prototype.mjs observe` no longer
  overflows the stack on large designs. The shipped graph is unchanged.
