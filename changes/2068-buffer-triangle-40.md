In short:

- In the schematic editor, BUF's, BUFE's and BUFT's triangle is 4 grid steps long, with BUFE and BUFT's name inside it.

In detail:

- **BUF, BUFE and BUFT: a 40 px triangle, their type inside (#2068):** core/schdoc-symbols.js and web/js/sch-svg.js
  draw BUF's and the tri-state buffers' triangle from x = 20 to 60 (4 grid steps; it was 34 / 36), INV keeping its
  triangle and bubble, which reach the same; the pins unchanged. BUFE's and BUFT's type (BUFE8 too) is inside the
  triangle, 7 px near its base, as INV's and BUF's (#2041); BUFE4's under its triangles. Tests: test/web-sch-svg.test.js,
  test/ui/sch-labels.test.js (both interfaces).
