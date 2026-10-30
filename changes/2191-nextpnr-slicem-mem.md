In short:

- **The nextpnr engine takes distributed RAMs and shift registers:** RAM16X1S, RAM16X1D, RAM32X1S and the SRL16 family, as with
  Silinx's own engine. RAM64X1S is still refused at Map.

In detail:

- **The nextpnr engine: the SLICEM's memories (#2191):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.8.0. A SLICEM's LUTs are memories too (BELs MEM16F, MEM16G); its packer pairs them as Silinx's does, with cascades on SHIFTIN and
  SRLC16E chains through Q15 on a CLB's two SLICEMs.
  - **src/fpga/nextpnr-mem.js** (new) writes the contents, the data's multiplexers and the write strobe as Silinx's packer does;
    **src/open-flow-nextpnr.js** (Map) accepts the cells; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates the contents.
  - **research/nextpnr-s3e/slicemem.v through nextpnr:** each memory slice's settings equal to Silinx's packer's; ISE's DRC with no
    errors or warnings, the .bit byte-identical to ISE's bitgen; its flip-flops simulate equal to the netlist. So too feat_srl and
    feat_srl_chain.
  - **Tests:** test/nextpnr-s3e.test.js (the settings against Silinx's packer, the simulation catching wrong contents, data or clock
    edge) and test/nextpnr-engine.test.js (the design built with the engine, no warnings).
