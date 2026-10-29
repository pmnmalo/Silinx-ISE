In short:

- The truth table editor has Handwritten…: one or more equations written by hand, one a line, with any names,
  become the editor's inputs, outputs and expressions. It is no longer a preview of the Development menu.

In detail:

- **Handwritten expressions in the truth table editor (#2010):** the editor's toolbar has Handwritten… (the
  Development menu keeps the handwritten table and schematic, previews). Its pad reads one or more equations, one a
  line, with any names (core/ink/equations.js: the strokes split into lines by their height, a bar, a stroke of = or a
  dot with its line; each line read by recognizeExpression); inserted, they replace the table's inputs (the
  expressions', in order of appearance), outputs (the equations' names), columns and expressions, one step of Undo;
  a single expression with no name is the selected output's. The editor's rules are the dialog's errors: an
  expression of several with no name, an output twice, a name both an output and an input, a reserved name, more than
  6 inputs. The pad is taller (two or three lines). Tests: test/ink-equations.test.js (the lines of drawings with
  bars and dots, the equations read, the table's columns against an independent evaluation, every error),
  test/ui/ink.test.js (two equations of new names into the editor, its rule, Undo), test/ui/truthtable.test.js,
  test/ui/dev-menu.test.js.
