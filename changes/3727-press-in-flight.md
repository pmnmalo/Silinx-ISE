In short:

- The Board Emulator takes a short click on a push button on a slow computer too: the design sees it held down
  for the whole press.

In detail:

- **A push button clicked while the worker runs a slice of cycles (#3727).** The compiled engine's worker runs a
  slice at a time, up to a quarter of a second's cycles when the page is slow: a click during one reaches the design
  when that run is over, but its release was counted from the page's older time, so it was let go as the run came
  back and the design saw no press (the UI test of #3109 timed out in CI). A press made during a run in flight is now
  counted from that run's end (`core/emulate-press.js`: `press(key, { now, busy })`, `tick(now, { settled })`).
