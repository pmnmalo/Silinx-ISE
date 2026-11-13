In short:

- **The MCP's simulate: a long run in bounded memory.** A run of seconds of a fast clock no longer grows the server to
  about 2 GB: it keeps only the changes it returns, and its signals' last values are those at the run's end.

In detail:

- **The MCP's simulate keeps only the changes it returns (#3503).** Every change of every signal was recorded until the
  waveform's limit (5,000,000, about 500 MB of the heap, 2 GB of the process), though the answer holds only the last
  `max_changes` of the signals asked. The waves now keep those (the simulator's `waveTail`), the other signals' present
  value only, with every change counted (`totalChanges`); with no recording's limit, the values at the run's end are
  right (they stopped at the limit before). A run that writes a VCD records every change, as before.
