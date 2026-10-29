In short:

- **New Source: a Wizard for the FSM, the ASM and the UCF:** a state machine's inputs, outputs, states and
  transitions, an ASM chart's states, or the pins of a module's ports on the board, asked page by page.
- **New Source's "Wizard >" goes straight to the wizard's own pages:** the name, the location and the language are
  those typed on New Source, no page "Name and Language" any more; the Petri net wizard has no quick-add buttons.

In detail:

- **The FSM, ASM and UCF wizards (#2082):** New Source ▸ Finite State Machine (FSM) / Algorithmic State Machine
  (ASM) ▸ Wizard >: the inputs and outputs (the port table), the clock and the reset (an FSM: Moore or Mealy), the
  states (an FSM's transitions too, from, to and condition; an ASM's state boxes chained), a summary; the chart is
  created and opened in its editor (`core/chart-wizard.js`, `web/js/chart-wizards.js`). Implementation Constraints
  File ▸ Wizard >: each bit of a module's ports on a pin of the board, assigned from it as I/O Pin Planning's
  Auto-assign and changed at will (typed with no board), a pin given twice refused; the `.ucf` is written, the
  project's constraints file when it has none (`web/js/ucf-wizard.js`).
- **"Wizard >" (#2082):** the button is "Wizard >" ("Assistente >"), and the wizards it opens (Module, Schematic,
  FSM, ASM, Petri Net, Clocking Wizard, Block Memory, UCF) leave out their "Name and Language" page: the name was
  checked on New Source's page (a reserved word, a module or a drawing's HDL file of that name), the language is
  chosen there too (shown for the HDL files and the drawings, and used by Next > for a drawing's HDL), the
  description and a clock manager's or block memory's count of the device's resources move to the wizard's first
  page. The Petri net wizard's Inputs and Outputs page has no "Quick add" buttons.
