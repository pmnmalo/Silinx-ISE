In short:

- **State diagram editor:** a double click on a state opens its name and outputs for editing in place, and one on a
  transition's label its condition, as the editor says (nothing opened).

In detail:

- **The state diagram's double click (#3459):** web/js/fsm-pointer.js sees the second press on the same state or
  transition (within 500 ms and 6 px) and opens its inline editing when it is released unmoved; the browser's
  dblclick never reached the item, drawn again by the first press with the pointer captured. A second press that
  drags still moves or bends. test/ui/fsm-parts.test.js double-clicks with the pointer (a state renamed, in its
  VHDL and Verilog too; Escape; a transition's condition), in both interfaces, with no warnings.
