In short:

- **Silinx toolchain's timing report: the pads' paths fitted to ISE's timing analyzer:** pad to setup, clock to
  pad and pad to pad now come within about 0.15 ns of trce's, and each input's hold time is given.

In detail:

- **Static timing: the pads' paths and the hold check fitted to trce (#26):** a global clock reaches every
  flip-flop at once, `SPEED_4.clock.Tgclk` (3.045 ns) after its pad (trce's clock skew is 0.000 ns there; the
  routed clock nets spread 0.4 ns). Setup takes the clock at its earliest; trce's shortest paths are `minScale`
  (0.751) of the model's. `Tiopi` / `Tioop` are 1.253 / 3.257 ns, and the data hold time is -1.018 ns. Each input
  now has its hold, and an asynchronous set / reset is left out of the pads' paths, as trce does. Against trce's
  data sheet of lab11 routed by Silinx and by ISE: rms 0.08-0.19 ns (the estimates were 1.9 ns low on setup and
  1.2 ns high on clock to pad); research/s3e-route/README.md.
