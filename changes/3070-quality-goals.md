In short:

- **Quality against ISE, measured again with nextpnr:** docs/QUALITY.md compares each of Silinx's Optimizations with
  ISE at the same goal (Area with XST's Area, Speed with its Speed, Fast with its default), on the 67 designs of the
  corpus.

In detail:

- **The quality comparison per Optimization (#3070):** `test/designs-corpus/compare-ise.mjs` builds every design at
  Area, Speed and Fast (`--goals`), and ISE at XST's `-opt_mode Area -opt_level 2`, `-opt_mode Speed -opt_level 2` and
  `-opt_mode Speed -opt_level 1` (each goal's ISE project of its own name, so that two goals do not share a remote
  folder); the results (`ise-comparison.json`) hold one Silinx and one ISE build per goal, the page one section per
  goal (size, speed and run time, the critical paths) and a summary line each; the results of the old form (Normal /
  High against ISE's default) are still read. Measured 2026-11-08 with nextpnr 1.4.0: at Area, slices −15 % and the
  critical path −14 % against ISE at Area; at Speed, −21 % and −8 %; at Fast, −20 % and +12 %. The page's text says
  nextpnr's placements (8 at Speed, or 32 up to 100 slices, the fastest by Silinx's estimate; one at Area and Fast).
