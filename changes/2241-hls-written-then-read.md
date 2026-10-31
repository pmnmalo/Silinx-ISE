In short:

- **Silinx HLS, a reference written before it is read:** a sequential function gives it one port (`s`, `s_ap_vld`), as a
  combinational one and Vitis HLS do, no longer `s_i`, `s_o` and `s_o_ap_vld`.

In detail:

- **Silinx HLS, a pointer or reference argument written before it is read (#2241):** a sequential function
  (`core/c-fsmd.js`) took the caller's value as an input whenever the argument was read, even after a write. Now
  `core/c-out-first.js` follows its reads and writes through the states: a read that a write reaches on every path (in
  the same state under the same condition, or in both branches of an if, or in a state before it on every path) is the
  value written, and the argument is an output only. A read that some path reaches with no write, such as a write under
  a condition or in a loop that may not run, keeps the input `<p>_i`, as before. The ports were checked against Vitis
  HLS 2025.2.
