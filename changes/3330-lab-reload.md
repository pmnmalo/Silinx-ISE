In short:

- **Guided labs:** a teacher's lab open as a Lab document follows its file: when the file is saved, the document shows
  its new steps, texts and checks, with the steps done kept; a file saved with problems leaves the document as it was.

In detail:

- **An open Lab document reads its lab file again when it is saved (#3330):** `web/js/lab-view.js labFileSaved`, with
  a file that has no problems, gives its lab to the open Lab documents of that file (`reload`: the steps done kept by
  their ids, the step shown when it is still there; "Lab "…" read again from labs/….lab.json" in the console); a file
  with problems is said as before and leaves the document as it was. Tests: UI labs (a lab open, its file saved with a
  new text and check: shown and checked, the step done kept; then with a problem: the document unchanged), both
  interfaces.
