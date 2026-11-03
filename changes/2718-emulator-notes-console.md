In short:

- **The Board Emulator's notes in the console:** what it says of the design (the engine that runs it and why, the
  timing generics' scale, the ports on no pin of the board, the VGA monitor's warnings, the serial terminal's pins) is
  written in the console after the line that opens it, its warnings in the Warnings tab too; its side panel keeps the
  Watch, the timing generics' values and the hint of its buttons.

In detail:

- **The emulator's notes go to the console (#2718):** as docs/UI-GUIDELINES.md asks, no message in a document's window.
  `mountEmulator` says them with `onNote(text, kind)` (web/js/emulator-side.js, web/js/emulator-serial.js); the
  Board Emulator's document writes them as "Board Emulator: …" lines after its first one (web/js/viewers.js), each run.
  The "Not on the board" box, the engine's and timing's notes, the VGA monitor's warning line and the serial
  terminal's note left the window, with their Portuguese (console lines are not translated).
