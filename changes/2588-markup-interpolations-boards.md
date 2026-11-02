In detail:

- **The markup check knows the Board Emulator's drawings and the editors' icons (#2588):** the #1443 test that every
  interpolation into the interface's markup is escaped or a safe shape failed on the boards drawn as the real boards
  (#2478 to #2481) and on the toolbars' icons (#2505): it now knows their drawing helpers (svgText escapes their
  labels; the connectors and modules are made of it and of numbers), a digit's place (DIG_X) and an icon of the table
  by its name (ICON[icon]); svgText's anchor, family and weight and the iCEBreaker's wires' colour are escaped.
  Test: test/web-markup-interpolations.test.js.
