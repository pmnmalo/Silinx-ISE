In short:

- **The Spartan-6's Map by nextpnr (on trial):** on a Nexys3 or Atlys project, Process Properties' Map (Spartan-6)
  can be nextpnr: nextpnr packs and places the design, then routes it as before. Silinx's Map stays the default until
  nextpnr's matches it (#3139); the MCP tool `set_process_properties` sets it too (`s6_map`).

In detail:

- **The Spartan-6's Map by nextpnr, behind an option (#3138):** with the project's `impl.s6Map` 'nextpnr' (Process
  Properties' Map (Spartan-6), the MCP tool `set_process_properties`'s `s6_map`; the spec's `s6Map`), Place & Route
  hands Yosys's netlist, each I/O buffer with its port and constraints, to the WebAssembly package of
  nextpnr-himbaechel's spartan6 micro-architecture (0.3.0: its packer, #3135, and its pads' and clocks' rules, #3136),
  which packs it into the sites of Silinx's Map and places them; Silinx checks the fork packed the same sites, reads its
  placement back by them, and routes, times and writes the bitstream as before. The netlist's cells are read by name
  then, as nextpnr reads them. Every example on the Nexys3 and the Atlys: routed on every seed, every PERIOD met, the
  routing check passed, every feature in the bit database, with no warning (test/examples-nextpnr-s6-pack.test.js).
