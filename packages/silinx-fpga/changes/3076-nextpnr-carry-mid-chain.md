In short:

- **nextpnr-himbaechel-spartan3e 1.4.1:** a carry chain whose carry is read by logic mid-chain is packed.

In detail:

- **nextpnr-himbaechel-spartan3e 1.4.1 (#3076).** nextpnr-spartan's PR 26 (5369e3ad): a carry read by logic mid-chain
  leaves by XB (an F stage's) or YB (a G stage's COUT, beside the next slice's carry in), where 1.4.0's packer stopped
  ("not supported yet"). `nextpnrToXdl` writes such a G stage's carry as two nets, as Silinx's packer does: the logic's
  from YB, `<net>_COUT` from COUT to the next slice's CIN.
