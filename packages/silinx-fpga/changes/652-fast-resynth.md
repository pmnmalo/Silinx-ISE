In detail:

- **Optimization Fast: the usual mapping's critical LUTs made one level shallower, their fan-out kept (#652).** Fast was
  Yosys's usual mapping alone, which follows a short control path as it is written: a LUT level more than XST on
  spi-fpga-slave's shift-register enable, iwls05-sasc's FIFO, the clock and micro80 examples. `synthesizeFast`
  (synth-fast.js) now gives the usual mapping's netlist the critical-LUT resynthesis Speed has had since #745, #914 and #1111
  (synth-open-resynth.js `resynthStage`, each clock's path too). It is no ABC mapping: the critical LUTs are rebuilt from
  their cones in JavaScript and the netlist written again. It is kept by DEPTH_RULE, on the 4-input-LUT families only (as at
  Speed), its result in `r.depth.resynth`. Area keeps its usual mapping as it was. Measured after Place & Route by Silinx's
  estimate (XC3S1200E corpus projects and the examples on their boards, mean of seeds 1–3):
  - iwls05-sasc: 3 -> 2 levels, 89 -> 95 LUTs, 67 -> 65 slices, 6.12 -> 5.05 ns (-17.4 %);
  - spi-fpga-slave: 21 -> 23 LUTs, 13 -> 14 slices, 5.55 -> 4.81 ns (-13.4 %), the enable on 2 levels;
  - vtr-stereovision3: 127 -> 131 LUTs, 77 -> 79 slices, 9.02 -> 8.27 ns (-8.3 %);
  - the clock example: 199 -> 208 LUTs, 190 -> 195 slices, 8.29 -> 7.66 ns (-7.6 %);
  - micro80: 7 -> 6 levels, 211 -> 220 LUTs, 144 -> 148 slices, 12.21 -> 11.60 ns (-4.9 %);
  - iwls05-spi: 785 -> 765 LUTs, 412 -> 402 slices, 15.17 -> 15.60 ns (+2.8 %, faster by the estimate, within the seeds'
    spread: 15.10 -> 14.99 at seed 2);
  - geometric mean of the six: -8.3 %; the other examples and corpus designs of #652 keep their netlists (iwls05-usb-phy,
    iwls05-i2c, the EPFL router, i2c and bar, vtr-diffeq1, traffic, blinky, pong, stopwatch, vga, isqrt, uart, gates); a
    synthesis takes under a second more.
  - **Tests:** test/synth-goal.test.js (spi-fpga-slave's enable in VHDL and in Verilog at Fast: 2 levels, 4.17 ns
    instead of 5.04, 12 LUTs, the netlist simulated against the design, no warning; the usual mapping unchanged).
