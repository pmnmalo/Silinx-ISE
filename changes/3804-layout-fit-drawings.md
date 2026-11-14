In short:

- **Every drawing on display fits its new room.** Showing or hiding the side panel or the messages, maximizing or
  restoring a document, and splitting or unsplitting the editor now zoom the state diagram, the ASM chart, the Petri
  net, the symbol and the waveform to Full View, as the schematic already did; split, each side's drawing. A drawing
  behind another tab fits when it is shown, if its room changed meanwhile. Text editors keep their scroll.

In detail:

- **The drawings zoomed to Full View when the layout changes (#3804).** web/js/layout-fit.js (#1203) now also serves
  the state diagram, ASM chart, Petri net and symbol editors and the waveform, each with its own Zoom to Full View;
  the Split Editor's split and unsplit (web/js/split-view.js) signal it as the Tasks bar's toggles do. A drawing hidden
  at the toggle is fitted once shown, if its size is not the one it had when last shown; the user's own resizes (the
  window, a divider) fit nothing.
