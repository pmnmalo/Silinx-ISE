In short:

- **Schematic Wizard:** its templates are now circuits worth starting from: a modulo-N counter, a clock divider, a PWM,
  an edge detector, a synchroniser and debouncer, an adder-subtractor, an accumulator, a multiplexed 7-segment display.

In detail:

- **The Schematic Wizard's circuits (#2231):** eight templates of several blocks wired together, each simulated against a
  model in VHDL and Verilog (`core/sch-circuits.js`); the templates that were one symbol (multiplexer, demultiplexer,
  adder, subtractor, comparator, decoder, priority encoder) are gone, the palette has them.
