In short:

- **New Source: < Back from a wizard** goes back to the File Name and Location page to change the name, the location
  or the language; that page is the same for every source type, the language (VHDL / Verilog, the project's by
  default) on it for all of them.
- **Boolean Algebra Wizard:** the inputs and outputs, or an expression, asked in a wizard of their own.

In detail:

- **< Back on a wizard's first page (#2140):** a wizard opened by New Source's *Wizard >* has *< Back* enabled on its
  first page: it closes and New Source opens again at File Name and Location, with the type, the name, the location
  and the language as they were (`wizard()`'s `back` and `start`, `web/js/wizards.js`).
- **File Name and Location the same for every type (#2140):** Source type, File name, Location and Language for all
  of them; the language no longer on the Define Module and Associate Source pages. The Boolean Algebra's optional
  expression (#1056) moves to the new Boolean Algebra Wizard (`web/js/tt-wizard.js`): the inputs and the outputs
  named, or an expression that gives them and fills the output's column; *Next >* makes the default table.
