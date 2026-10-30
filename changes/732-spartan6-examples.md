In detail:

- **The examples on the Spartan-6 boards (#732):** the seven examples are built by the Silinx toolchain on the Nexys3
  and the Atlys too, with no warning, their PERIOD met (test/examples.test.js); their pins on both boards are checked
  (test/blinky-example.test.js, gates, traffic: the Spartan-6 boards' 100 MHz clock). `TARGETS` (test/examples-lib.mjs)
  lists both boards; the ISE tests and the power estimates keep the Spartan-3E's (`S3E_TARGETS`), the Spartan-6's
  bitstreams being checked against ISE's bitgen in research/s6.
