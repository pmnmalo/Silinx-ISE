In short:

- **Silinx HLS:** DATAFLOW regions can be nested and called several times, and the synthesis report gives each
  process's latency and the region's interval.

In detail:

- **DATAFLOW: nested regions (Fixes #1706):** a process that is itself a region has its processes and channels in its
  caller's (core/c-dataflow-nest.js); a region the top calls among other statements is a module of its own, called each
  time, its tasks' state kept. `s.write(a + n++)` is made, the value before the change (`?:`, `&&` and `||` stay
  refused). The report's processes have their latency, the region its latency and interval. The corpus's
  `unique_task_regions` now passes with Vitis HLS's ports. Test: test/c-dataflow-nest.test.js.
