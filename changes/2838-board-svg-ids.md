In short:

- I/O Pin Planning's Board view draws the board in its colour (the Basys2 blue) when the Board Emulator is open too.

In detail:

- **Each drawn board its own SVG ids (#2838):** the boards' PCBs got their colour from a gradient with a fixed id
  (`b2pcb`, `nx2pcb`, `s3epcb`, `nx3pcb`, `atpcb`, `icbpcb`); with the Board Emulator and I/O Pin Planning's Board view
  both open the document had each id twice, and the visible board's `url(#…)` resolved to the hidden tab's gradient,
  so the PCB was painted white. `svgEl` (`web/js/emulator-pcb.js`) now gives the ids a drawing defines the drawing's
  own number, in their definitions and their references (`scopeIds`), and every PCB's fill has a plain fallback
  colour. The editors' drawings (schematic, ASM, FSM, Petri net, truth table) already had ids per instance.
  - **Tests:** test/emulator-pcb-ids.test.js (every board drawn twice: no id shared, every reference its own
    drawing's, the fallback colour), test/ui/emu-board-ids.test.js (the emulator and the Board view together, tabs
    switched, each closed, on every board, both interfaces, no warnings).
