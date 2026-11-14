In short:

- **The 7-series: Place & Route with the best of 3 seeds.** A Basys 3 or Nexys A7 project implemented with the Silinx
  toolchain can have nextpnr place and route it three times (Process Properties ▸ Place & Route (7-series): Best of 3
  seeds), the fastest kept: about 3 % more Fmax on the examples, for three times the Place & Route's time. Off by default.

In detail:

- **The 7-series' best of 3 seeds (#3825):** an Implement Design property of the 7-series (`impl.xc7Seeds: 3`; Process
  Properties' "Place & Route (7-series):", in Portuguese too; the MCP's `set_process_properties` `xc7_seeds`): nextpnr
  (router2) places and routes the design with seeds 1, 2 and 3, the run with the best Fmax (nextpnr's estimate of the
  slowest clock) kept, a tie to the lowest seed, a failed seed left out (all failed: the first's error, as one seed's).
  The log says each seed's Fmax and the one kept, the timing report and the report's `par.seeds` too; only the kept run's
  warnings are given. The local server runs the three at once in worker threads (on a computer of 8 GB and 4 cores or
  more), the browser edition one after another in its worker; Stop stops them all and nothing is written. The browser's
  fallback to router1 (#3143) now says its warning among the run's lines, so the kept run's only.
