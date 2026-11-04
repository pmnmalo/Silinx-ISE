In short:

- **No messages in a status line:** the Schematic's check says its errors and warnings in the console only, no longer
  in its status line; I/O Pin Planning warns of a pin assigned more than once in the console, its status line keeping
  the I/Os assigned.

In detail:

- **The status line says no messages (#2784):** the Schematic editor's status line no longer counts the check's errors
  and warnings; I/O Pin Planning's "pins assigned more than once" is a warning in the console (once, until the pins in
  question change) and its "Saved to …" is gone (the tab's mark says it), its status line keeping "N/M I/Os assigned"
  (docs/UI-GUIDELINES.md).
