In short:

- **Silinx HLS, the ASM chart of a C function:** a stream's read and write show as the C writes them,
  `t = in.read()` and `out.write(s)`, with the FIFO's wait and handshake, instead of `<fiforead>` / `<fifowrite>`; a
  floating-point constant shows as written (`0.5f`) instead of `<float>`.

In detail:

- **Silinx HLS: a stream's read and write in the ASM chart (#1941):** `core/c-print.js` gives the statements
  `core/c-fifo.js` makes their C (`ap_fifo_in_0 = in.read()`, `out.write(s)`), and a floating-point literal its text;
  `core/c-asm.js` draws, after a read's (a write's) state action, a decision on the FIFO's `in_empty_n` (`out_full_n`)
  that goes back to the state while it is 0, and under it the handshake as a conditional output
  (`in_read = 1; ap_fifo_in_0 = in_dout`, `out_din = s; out_write = 1`), by the module's ports (a stream named `in`,
  a reserved word: `in_r_empty_n`, `in_r_read`).
