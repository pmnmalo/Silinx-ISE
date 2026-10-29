In short:

- In the schematic editor, a VCC or GND turned 90° or 270° has its label beside its bars instead of over them.

In detail:

- **Schematic editor: VCC's and GND's label clear of the symbol in every orientation (#2042):** web/js/sch-svg.js
  places the label past the bar away from the pin (VCC's bar, GND's last bar): above or below it upright or turned
  180°, beside it, anchored away from it, when turned 90° or 270°. Tests: test/web-sch-svg.test.js (every orientation,
  mirrored too; upright where it was), test/ui/sch-vcc-label.test.js (the boxes measured on the screen, both
  interfaces).
