In short:

- **Schematic Wizard templates:** New Source ▸ Schematic ▸ Wizard starts with a Template page: a register, a shift
  register, a counter, a multiplexer, an adder, a decoder and others, with their symbols placed and wired.

In detail:

- **A Template page in the Schematic Wizard (#2180):** Empty (the markers only, as before), register, shift register,
  counter, multiplexer, demultiplexer, adder, subtractor, comparator, decoder, priority encoder and a full adder of
  gates, with their parameters (width, clock enable, reset…); the next page shows their ports, which can be renamed
  and added to; their directions and widths stay the parameters' (`core/sch-templates.js`).
