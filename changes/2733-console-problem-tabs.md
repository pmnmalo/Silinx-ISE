In short:

- **The console's Errors and Warnings tabs:** an error written to the console brings its Errors tab to the front, else
  a warning its Warnings tab, whatever wrote it (a process, an editor, the emulator).

In detail:

- **An error or a warning written: its tab in front (#2733):** the console's shared drawing of its Errors and
  Warnings tabs (`web/js/console.js`) brings the Errors tab forward for a new error, else the Warnings tab for a new
  warning: once per batch of lines (errors winning), not again for a message already listed, and a warning leaves the
  Errors tab in front while it lists errors, and a tab so brought forward goes back to the Console once it lists
  nothing (cleared, a project opened after the start-up checks' warnings); info never switches it, and the keyboard's focus stays where it is. The
  Silinx interface's folded messages open for a new warning too (for errors only before).
