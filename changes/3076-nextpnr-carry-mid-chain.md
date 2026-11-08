In short:

- **The EPFL multiplier at Optimization Area placed and routed by the nextpnr engine:** a carry chain whose carry is read
  by logic between two of its stages no longer stops it ("not supported yet").

In detail:

- **The Spartan-3E's nextpnr engine at 1.4.1 (#3076).** nextpnr-himbaechel-spartan3e 1.4.1 (nextpnr-spartan PR 26,
  5369e3ad): a carry read by logic mid-chain leaves the slice the way the chain's last one does, an F stage's by XB, a
  G stage's COUT by YB beside the next slice's carry in, as ISE's map does. epfl-multiplier at Area and at Fast
  (XC3S1200E): 3418 slices, 141.797 ns, with its PERIOD 20 ns warning. Such a G stage's carry is written in the XDL as
  Silinx's packer writes it: the logic's net from YB, `<net>_COUT` from COUT to the next slice's CIN (one net with both
  pins before, whose COUTUSED the simulation check could not tell). The design corpus is unchanged.
