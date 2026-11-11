In short:

- **The logic analyzer shows a signal that does not change:** a capture whose samples are all the same (a few thousand
  samples of a slow signal, as blinky's LEDs) opened an empty window; it now shows the probe's flat wave.

In detail:

- **The capture's replay with unchanged samples (#3340):** the Verilog replay of a capture (`core/ila-capture.js`
  replayBench) wrote a bare delay for a sample with no change, which did not compile; at a few thousand samples the
  window opened with no signals. A sample with no change is now a delay of its own (`#20000;`), and a replay that does
  not compile is an error in the console (`web/js/capture-ui.js`). The replay's header has the trigger's time.
