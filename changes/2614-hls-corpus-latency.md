In detail:

- **The HLS corpus compares the co-simulation's latency too (#2614):** `npm run test:hls` fails when a design's latency
  (its minimum, maximum and average cycles) differs from `expected.json`, no longer only when a stage passes or fails.
  Three designs had moved unnoticed, all with #1901, which ran the corpus with its configs' `INTERFACE` directives and
  made a `BIND_STORAGE` array a memory: misc-initialization-and-reset-static-array-rom 1 → 3 cycles (its two arrays
  ROMs, as Vitis HLS's), modeling-pointers-stream-good 5 → 13 (`ap_fifo`), modeling-pointers-stream-better 2 → 13-14
  (`ap_hs`); recorded as they are. Not a regression: the earlier numbers were of other interfaces. The gaps against
  Vitis HLS's 1, 6 and 5 cycles are #2967 (an `ap_fifo` / `ap_hs` access two states) and #2968 (the reads of two
  memories in one statement in states one after the other).
