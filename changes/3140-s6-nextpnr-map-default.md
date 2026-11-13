In short:

- **Spartan-6: nextpnr's Map by default:** on the Nexys3 and the Atlys, nextpnr now packs and places the design by
  default (Process Properties' Map (Spartan-6): nextpnr, no longer "on trial"); Silinx's Map can still be chosen until it
  is removed.

In detail:

- **The Spartan-6's Map: nextpnr's packer the default (part of #3140):** after its parity (#3139: the same slices, the
  periods within 5 % on average, ISE's DRC clean and the .bit byte-identical to ISE's bitgen on 20 of 20 designs),
  `s6MapOf` gives `nextpnr` unless a project saved `impl.s6Map` `silinx`, and the flow packs with nextpnr unless the
  spec's `s6Map` is `silinx` (the command line and the research scripts too). Process Properties lists nextpnr first, with
  no "(on trial)" (its Portuguese entry removed), and saves the Map only when it is Silinx's; a project saved with
  nextpnr's on trial keeps it, the choice dropped on OK. The MCP tool `set_process_properties`'s `s6_map`: `nextpnr` (the
  default) or `silinx`. The ISE tests check nextpnr's Map by default, Silinx's with `SILINX_S6_MAP=silinx`.
  docs/TOOLCHAIN.md and docs/OPEN-TOOLCHAIN.md follow. Tests: mcp-s6-map, s6-nextpnr-pack (`s6MapOf`), nextpnr-s6
  (Silinx's placement of the block RAMs and DSPs with `s6Map` `silinx`), examples-nextpnr-s6-pack (Silinx's Map chosen
  for the comparison), the UI tests open-toolchain (the field, in Portuguese too, Silinx's saved, the default not saved)
  and standalone (the browser build packs and places by nextpnr).
