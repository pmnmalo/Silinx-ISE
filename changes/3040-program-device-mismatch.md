In short:

- **A bitstream built for another device is not programmed:** programming the board or the PROM with a `.bit` built
  for another FPGA than the project's (or the board's) stops with an error, as the browser edition does.

In detail:

- **A device mismatch refused by the server's programming (#3040):** the full application's Program FPGA and Program /
  Verify PROM refuse a `.bit` whose part is not the project's device (else the board's), "bitstream was built for
  '…' but the target device is '…': not programmed", before any tool runs, as the browser's programming refuses it
  (`server/programmer.js` programJob, promJob); a request's `force: true` programs it anyway, warned. The device
  checked is the project's or the board's only: a request's `expectDevice` is no longer taken
  (`server/impl-routes.js`).
