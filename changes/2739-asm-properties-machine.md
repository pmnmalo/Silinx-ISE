In short:

- **The ASM chart editor's Properties:** nothing selected, they show the machine's settings only, with no "Selection"
  help; the Machine section no longer folds.

In detail:

- **The ASM chart editor's Properties panel (#2739):** with nothing selected, no "Selection" heading, help text and box
  legend (web/js/asm-inspector.js: the selection's section hidden); the Machine section a section of its own with its
  heading, not a `<details>` that folds (web/js/asm-editor.js), in the editor and its read-only views. Tests:
  test/ui/asm-inspector.test.js, test/ui/asm-editor-chrome.test.js (both interfaces).
