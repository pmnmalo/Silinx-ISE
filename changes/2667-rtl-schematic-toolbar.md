In short:

- The RTL and Technology Schematic views have one toolbar: ⬆ Up, ⬇ Push into and the module's file are its first
  buttons, and the bar above it (with "RTL Schematic (read-only) — top : top") is gone.

In detail:

- **The RTL and Technology Schematic: Up and Push into in the schematic's toolbar (#2667):** web/js/viewers.js puts
  ⬆ Up, ⬇ Push into and "Open <file>" at the start of the schematic editor's toolbar instead of a bar of their own
  with the view's name and the hierarchy's path; they stay usable while trying the circuit (Try it). Tests:
  test/ui/editing.test.js, test/ui/viewers-try.test.js, test/ui/open-toolchain.test.js, test/ui/standalone.test.js.
