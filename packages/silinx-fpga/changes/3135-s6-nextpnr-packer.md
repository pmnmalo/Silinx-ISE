In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.3.0, with the packer and the pads' rules (#3135, #3136).**
  The package packs Yosys's `synth_xilinx -family xc6s` netlist into whole sites as Silinx's Map does (the same sites,
  site pins and timing arcs; the site cell's `SILINX_PACK` attribute names what it holds), and places a packed
  netlist's pads and global buffers as Silinx's placer does: a LOC as a fixed pad, one VCCO per bank, a clock pad's
  global buffer on its dedicated path (pmnmalo/nextpnr-spartan#29). Silinx still hands nextpnr the netlist of its own
  Map's sites, which the package places and routes as 0.2.0 did; handing it Yosys's netlist is #3138.
