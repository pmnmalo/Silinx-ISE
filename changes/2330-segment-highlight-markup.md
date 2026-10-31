In detail:

- **The schematic's segment highlight checked by the markup scanner (#2330):** its polyline is written in the wire's
  template as a template of its own, which `test/web-markup-interpolations.test.js` (#1443) scans, instead of a
  local the scanner rejected.
