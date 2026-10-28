In short:

- **A wider bus join:** the BUS JOIN's inputs are longer, so their bits' labels, (15:8), fit on them; turned
  upright, the labels of neighbouring inputs sit at two heights. Schematics of before are converted when opened.

In detail:

- **The bus join 60 px wide, document version 6 (#1910):** its inputs' leads 0..38, its bar at 38..42, its output at 60;
  each input's label centred on its lead, and turned 90° / 270° every other one further along it, never side by side.
  A schematic of version 5 has each join placed so that its inputs stay where they were, its output moved along its
  lead and what met it following (a wire's end moved, a wire of no length dropped, a bus wire from another symbol's
  pin). The ISE export draws its bus taps from its bar, as long as before, and the bus from the bar to its output. The
  gates example and the schematic corpus brought to version 6.
