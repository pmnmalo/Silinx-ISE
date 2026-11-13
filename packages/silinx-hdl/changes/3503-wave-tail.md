In detail:

- **`waveTail`, a Simulator's option (#3503):** `waveTail(sig)`, the changes of a signal's waveform kept, its last ones
  (`wave.dropped` counts those let go); no recording's limit then (`maxWaveEvents`). A run that shows only its end
  (the MCP's simulate) runs in memory bounded by its signals, however long.
