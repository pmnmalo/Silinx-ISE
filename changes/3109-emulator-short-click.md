In short:

- **A short click on an emulated push button counts:** the Board Emulator holds a button down until the design has
  seen a real press, so the clock, pong, stopwatch and blinky examples' debounced buttons react to a short click,
  not only to a long one.

In detail:

- **Push buttons held as long as a real press (#3109):** a design's debouncer takes a press once the button has
  stayed down for some milliseconds of the board's time (the examples': 20 ms, a million cycles), and the emulator,
  slower than real time (the event-driven engine much slower), let a short click go after fewer cycles. A button let
  go now stays down, lit, until 100 ms of the board's time have passed since it was pressed (at a set clock rate,
  100 ms of its cycles, at least one); a longer press is let go at once, a button let go while paused at once, and
  Shift+click still keeps it pressed (`core/emulate-press.js`).
