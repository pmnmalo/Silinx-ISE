In short:

- A correction typed in a handwriting dialog right after the last stroke is kept, not replaced by the pad's reading.

In detail:

- **The handwriting dialogs keep a correction typed while the pad's reading is pending (#2389):** each stroke reads
  the pad a moment later, and Insert, Fill Table or Create Schematic read it at once; a correction typed before that
  reading (the Recognized text, the table's text, a gate's type or a name) was replaced by it. Typing now cancels the
  pending reading; the next stroke reads the pad again. The UI tests of the three dialogs correct while a reading is
  pending, and the handwritten expression's test no longer fails now and then on a slow machine.
