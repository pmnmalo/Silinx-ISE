In short:

- **Silinx HLS:** a DATAFLOW top's streams can be `axis` ports (with `s_axilite` and `m_axi` beside them), and a stream
  of structs is one word, the same ports as Vitis HLS.

In detail:

- **DATAFLOW: a top's interfaces as Vitis HLS's (#1706):** an `axis` stream of a DATAFLOW top is made AXI4-Stream ports
  instead of being ignored with a warning; a stream of structs of the top is one word on its port, an adapter
  (core/c-processes-word.js) between it and the FIFOs of its members, which the processes read and write each in a
  state of its own. `axis` around the AXI interfaces' module, for any top: `axis` beside `s_axilite` or `m_axi` was
  silently left as `ap_fifo` ports. A DATAFLOW top's memory keeps both ports inside these modules (`autorestart`'s
  top lacked `_d0`, `_we0`, `_q0`...). The corpus's `axi_stream_to_master` and `autorestart` now have Vitis HLS's
  ports. Tests: test/c-processes-word.test.js, test/c-axis.test.js.
