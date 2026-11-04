In detail:

- **Silinx HLS's report and options in core/ (#2674):** View C Synthesis Report's lines and warnings (`cReportLines`) and
  the clock, family delays and multiplier blocks a C function is scheduled for (`hlsClockOf`, `hlsFamilyOf`,
  `hlsMultsOf`, of a board and a device) move, as they were, from web/js/c-source.js into `core/c-report.js`, so that
  the server reports them too (the MCP's C tools, next); c-source.js's `hlsClock`, `hlsFamily` and `hlsMults` call
  them. No change of behaviour (the multiplier blocks never a limit, as before: #2783). Test: test/c-report.test.js.
