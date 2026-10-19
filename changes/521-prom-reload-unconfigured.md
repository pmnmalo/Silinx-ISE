In short:

- **Reload FPGA from PROM after Program PROM on a board switched on with an empty PROM:** it failed with the
  jumper hint though the PROM was right; the FPGA is now reset to load from the PROM when the PROM's CONFIG does
  not start it, and a Reload on an erased PROM says so.

In detail:

- **Reload FPGA from PROM on an unconfigured FPGA (#521):** on a Basys2 powered up with an erased Platform Flash,
  Program PROM then Reload failed in the browser edition and the full application alike. With the FPGA
  unconfigured (DONE low), a read of the PROM (the verify) leaves its address counter past the image; CONFIG then
  loads nothing, while the FPGA's JPROGRAM (INIT_B resets the counter) loads it in 1.4 s. `core/xcf.js` and
  `scripts/xcf_prog.py` poll DONE 2.4 s after CONFIG, then say `the FPGA did not start after CONFIG: JPROGRAM (the
  FPGA reset, it loads from the PROM)`, reset the FPGA and poll 5 s more; with still no DONE and the PROM erased
  (its first block all 1s): `the PROM is erased: nothing to load (Program PROM first)` instead of the jumper hint
  (`server/programmer.js` passes it on). The simulated PROM models the address counter (a read moves it unless
  the FPGA's DONE holds it, CONFIG loads from it, JPROGRAM resets it); tests (`test/xcf.test.js`,
  `test/ui/standalone.test.js`) cover the recovery, CONFIG alone on a configured FPGA, and the erased PROM.
  Verified on the board with the full application.
