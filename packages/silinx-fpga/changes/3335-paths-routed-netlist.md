In detail:

- **The timing paths read the netlist the run routed (#3335):** the timing step's paths (`open/paths.json`, #3178) take
  their cells from the netlist this run translated (its top the synthesis's: a logic analyzer's wrapper), not from the
  build folder's netlist of the project's top, which with a capture is another run's: every path then had no source
  line.
