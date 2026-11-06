In detail:

- **Safe output's scan covers the pages, core/'s markup and every sink spelling (#2986):** `test/safe-output.test.js`
  also scans the inline scripts of `web/*.html` and the SVG / HTML templates of `core/` and `server/` whose values are
  not escaped (each listed with its reason: `graphicSvg`'s kind and coordinates, the ISE `.sch` and PNML files'
  numbers, the CSP's `<meta>`), and finds the sinks by every spelling: h()'s `{ html }` shorthand, `el['innerHTML'] =`
  and a property named in a string (`el[prop] =`), `Object.assign`'s `innerHTML:`, an iframe's `srcdoc`,
  `parseFromString`, `setHTMLUnsafe`, `Document.parseHTMLUnsafe`, `createContextualFragment`; a fixture per new kind
  of sink. No sink needed escaping: no change of behaviour.
