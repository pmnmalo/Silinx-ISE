In detail:

- **SSim's times, values and forces in core/ (#2674):** `parseTime`, `parseValue` and `UNITS` move, as they were, from
  web/js/isim.js into `core/ssim-values.js`, and the signals' and instances' paths and the forces' pseudo-process
  (`findSignalIn`, `findInstIn`, `injectForceIn`) from web/js/isim-forces.js into `core/ssim-forces.js`, so that the
  server forces signals as SSim does (the MCP's forces, next); isim.js still exports the three. No change of
  behaviour. Test: test/ssim-forces.test.js.
