In detail:

- **The schematic drawing's interpolations safe for #1443's check (#2110):** web/js/sch-svg.js writes a gate row's
  coordinates as numbers, BUFE / BUFT's squeezed type and VCC / GND's label anchor inline, so that
  test/web-markup-interpolations.test.js recognises them (the drawing unchanged).
