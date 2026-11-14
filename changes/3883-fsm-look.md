In short:

- **A state diagram's look:** a state's fill and border colours, border width, text colour, size, style and font, and a
  transition's line colour, width and style (solid, dashed, dotted) and its label's colour, size, style and font, set
  in Properties (Look) and saved with the drawing; the generated HDL does not change.

In detail:

- **A state's and a transition's look in the FSM editor (#3883):** the Properties of a selected state or transition
  end with Look (web/js/fsm-look.js): colour pickers (showing the colour drawn; ✕ back to the theme's), the line's
  width and style, the text's colour, size, style and font, and Default look; each change an undo step. The look is
  the object's `look` in the .fsm.json, only what differs from the default written (an old drawing drawn and saved as
  before); a colour not chosen follows the light or dark theme, a chosen one is kept. core/fsm-style.js checks every
  value (a colour #rrggbb, a size from 6 to 48, a width from 0.5 to 10, the lists) with the same messages in the
  editor (the console) and in the MCP's new set_fsm_look; a file's value not valid is an error of Check, the drawing
  made with the default look in its place. The drawing reads the look as CSS variables of each object (fsm-render.js,
  fsm-editor.css), the selection, the problems and the simulation still drawn over it; a circle grows with its text.
  Portuguese labels and messages. Tests: test/fsm-style.test.js (the values, the defaults left out, the round trip,
  the HDL the same in VHDL and Verilog, Check), test/fsm-i18n.test.js, test/mcp-fsm.test.js, UI fsm-look (each
  property drawn, refused, undone, the theme, saved and reopened, the HDL unchanged and compiled with no warnings,
  Portuguese) and fsm-side.
