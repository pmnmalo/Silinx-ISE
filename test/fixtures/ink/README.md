# Real handwriting: the recognizers' corpus (#1749)

Drawings made by real hands on real devices (a pen display, a tablet's pen, a finger, a mouse), each with what it
should read as. `test/ink-real.test.js` reads every one with its kind's recognizer (`core/ink/corpus.js`
`readDrawing`) and asserts each kind's rate: the share read exactly as expected may never fall below its floor
(`FLOORS` in the test), and the floor is raised whenever the recognizers improve. The misreads are listed in the
test's output.

The tests of the recognizers otherwise use synthetic hands (`core/ink/synth*.js`); these are the real ones.

## Adding a drawing

1. Open the handwriting dialog (the Boolean Algebra editor's *Handwritten…*; in a development build *Development ▸
   Handwritten Boolean Algebra… / Schematic…*), draw, and press **Copy Drawing** (where the browser does not let the page copy, the drawing's text
   is shown to copy by hand).
2. Paste it into an issue (or straight into a new file here), with what it should read as.
3. Save it here as `<kind>-<what>-<device>.json` (e.g. `schematic-and2-ipad.json`), and add to the object:
   - `"expect"`: the text it should read as, as the recognizer writes it:
     - an expression: the dialog's text (`F = A·B' + C`);
     - a truth table: the table's text (`A B | F`, then a row a line, as in the dialog);
     - a schematic: the circuit's lines (`U1 and2 (A, B) -> Z`; a net with no name by its source, `U1`; a
       flip-flop's pins by name, `U2 fd (D: d, C: clk) -> Q: q`);
   - `"note"` (optional): who drew it, on what, and anything worth knowing.
4. Run `node --test test/ink-real.test.js`: a drawing read wrong is listed; fix the recognizer, then raise the floor.

No personal data in a drawing's note (the corpus is public).
