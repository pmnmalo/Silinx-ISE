In short:

- **Handwriting learns from your corrections:** a character you correct in the Handwritten Expression dialog before
  inserting it, a gate's type you choose or a name you correct in the Handwritten Schematic dialog, is kept as a
  sample of your handwriting, and read your way the next time; Forget My Samples forgets them.

In detail:

- **The handwriting dialogs learn from the user's corrections (#1751, part of #1055):** on Insert, the characters of
  the expressions whose text the user changed, where the text still lines up with the ink (the same lines, as many
  letters, digits and ? on each, not a text written again), become samples of the user's handwriting, kept by the
  browser with those of Teach Silinx my handwriting; on Create Schematic, a gate's type of another outline chosen in
  the list keeps the gate's outline as a sample of that one (AND, OR, XOR, BUF), a name corrected of as many letters
  its letters changed; the console says what was kept. The samples are the user's own templates
  (`core/ink/templates.js` userTemplates, userGateTemplates for the gates' outlines, readSchematic's `gates`), Forget
  My Samples forgets them all (`core/ink/learn.js`: expressionSamples, schematicSamples; readSchematic's gates and
  names give their strokes, recognizeWords its characters').
