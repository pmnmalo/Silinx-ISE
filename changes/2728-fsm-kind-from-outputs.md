In short:

- **State diagrams: Moore or Mealy follows from the drawing.** The FSM editor's Moore / Mealy selector and the FSM
  Wizard's "Machine type" are gone: outputs on a transition make the machine Mealy, outputs on the states only make it
  Moore. Giving a transition an output no longer needs choosing Mealy first.

In detail:

- **The kind of a state machine derived from its outputs (#2728):** `fsmKind` of core/fsm.js, which normalizeFsm writes
  as the diagram's `type`; the stored one is not read. A file whose stored kind agrees with its outputs generates the
  same VHDL and Verilog as before (the repository's 23 state machines: the test designs, traffic, the KISS2 corpus,
  the wizard's templates, in every encoding and style). When it contradicts them, the outputs win: a "Mealy" machine
  with no output on a transition is Moore (the same logic, its header saying Moore); a "Moore" machine with an output
  on a transition, an error before, is Mealy and generates its HDL. The Sequence detector template keeps its Moore /
  Mealy choice (it draws two different machines). Tests: test/fsm-kind.test.js (the HDL compiled, elaborated and
  simulated in both languages), test/ui/fsm-side.test.js, test/ui/chart-wizards.test.js.
