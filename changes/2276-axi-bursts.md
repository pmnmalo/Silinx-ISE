In short:

- **Silinx HLS: AXI4 bursts on m_axi:** an `m_axi` argument is read and written in bursts, as Vitis HLS makes them: a
  loop that reads an array over the bus waits for a burst, then reads on at once, and its writes go out gathered into
  bursts; a copy of 40 words takes 277 cycles in the co-simulation, where it took 486.

In detail:

- **Silinx HLS: AXI4 bursts on m_axi (#2276):** the AXI4 master's adapter (core/c-axi-master.js) serves a port's read
  that misses with a burst from its element on (`ARLEN` > 0: up to `max_read_burst_length=`, Vitis HLS's 16 by default,
  within the array's depth and its 4 KB page) into a buffer of the port, its next reads served from it at once, as a
  memory's; a port's writes go into a buffer of their own, consecutive beats gathered into a burst (`AWLEN` > 0, up to
  `max_write_burst_length=`), its byte strobes each beat's, written out when the buffer is full, when a write does not
  follow it, when a read misses, and when the function is done: `ap_done` (and `ap_ready` with it) waits for them, the
  module held (`ap_ce`). A write taken updates the read buffers that hold its beat; the read buffers are emptied at
  `ap_done`. Every burst is of beats of the bus's width. The co-simulation's bus model (core/c-axi-bfm.js) takes a beat
  of several elements (bytes and shorts on a 32-bit bus), each element's strobes checked. Co-simulated in VHDL and
  Verilog, with the corpus's m_axi designs; test/c-axi-burst.test.js. The other cases left from #1893 (a pointer passed
  on with m_axi, `ap_ctrl_none` with `s_axilite` arguments, an array with `s_axilite`) stay as they were.
