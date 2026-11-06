In short:

- **Schematic editor, an I/O marker added on a pin:** it faces the way the pin points, the symbol's rotation and
  mirror applied: above a pin pointing up, below one pointing down, to the left or the right of one pointing
  sideways; no longer always to the left for an input and to the right for an output.

In detail:

- **An I/O marker added on a pin continues the pin outwards (#2926):** Add I/O Marker on a symbol's pin sets the
  marker's side from the pin's outward direction on the sheet (`pinSide`, `newMarkerSide` in `core/schmarker.js`):
  up N (ISE's R270), down S (R90), left W, right E; the direction's default side is not stored. On a wire or on empty
  space the marker keeps its direction's default side, as before. The HDL is unchanged by the side, and the side
  goes to ISE's `.sch` as the I/O marker's orientation and back. No MCP tool adds I/O markers (a schematic is
  written whole with `write_file`).
