In short:

- Schematic: a MUX or DEMUX with a pin per bit shows its select names (S0, S1…) on every row, and its shared select
  lines run behind the shapes, seen only between them.

In detail:

- **Schematic: MUX / DEMUX pins per bit, the selects on every row (#2127):** each multiplexer and demultiplexer of
  the stack has its selects' names where the last one has them, in every orientation; the shared select lines are drawn
  before the bodies, so only the pieces between the rows show; M4_1… inside each multiplexer (#2122), DEMUX's type
  above the stack as the one-bit one's. Tests: test/web-sch-svg.test.js, test/ui/sch-mux-rows.test.js.
