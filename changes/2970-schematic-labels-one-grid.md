In short:

- View RTL / Technology Schematic and Convert to Schematic draw a large module faster: pong's technology schematic's top
  level in a few seconds, no longer more than a minute.

In detail:

- **A schematic made from HDL places its net names on one wire grid (#2970):** `netLabels` (`core/schdoc-place.js`)
  builds the grid of the symbols, markers and wires once and takes a net's own wires out while its name is placed (then
  puts them back and adds the name), where `placeAndRoute` built a whole grid for each name; the names in the same
  places (every drawing of the examples and of the design corpus the same as before), in a fraction of the time.
  `test/schdoc-place-labels.test.js` checks the places against the grid built for each name on every example's drawings
  and the time on micro80's largest.
