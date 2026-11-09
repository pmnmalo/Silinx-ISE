In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.3.0 (#3135, #3136).** The package can pack Yosys's
  netlist into sites and place its pads and global buffers as Silinx's Map and placer do
  (pmnmalo/nextpnr-spartan#29); Silinx's flow still hands it its own Map's sites, placed and routed as before (#3138
  will hand it Yosys's netlist).
