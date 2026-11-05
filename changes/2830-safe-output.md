In detail:

- **Safe output, checked (#2830):** `test/safe-output.test.js` scans `web/js` for HTML built from a non-constant string
  (`innerHTML` / `outerHTML` assigned, `insertAdjacentHTML`, `document.write`, `h()`'s `html:`): each one is among the
  reviewed sinks, whose project text goes through an escaping helper (`esc`, `highlightHdl`, `svgText`), or the test
  fails (the reviewed counts only shrink). It checks the Content Security Policy (no inline script but the page's own,
  no remote script, no plugin, no `<base>`) and that the application's only dynamic code is the compiled simulator's
  (whose generated code holds no name of the design) and the iCE40 nextpnr's own module, so `'unsafe-eval'` runs no
  project text. `test/ui/safe-output.test.js` opens a schematic, an FSM, an ASM chart, a truth table, a Petri net and HDL
  sources with a markup payload in every text field, in the editors, the Design tree and the console: no element is
  made of it. SECURITY.md says how.
  - **Tests:** test/safe-output.test.js, test/ui/safe-output.test.js (both interfaces).
