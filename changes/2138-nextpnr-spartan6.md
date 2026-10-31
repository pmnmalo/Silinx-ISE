In short:

- **The nextpnr engine on the Nexys3 and the Atlys:** with the engine set to nextpnr, the local server now places and
  routes the Spartan-6 boards' designs with it too.

In detail:

- **nextpnr's Place & Route on the Spartan-6 (#2138):** the local server's flow gives the Spartan-6's Place & Route to
  nextpnr (the new dependency `@silinx/nextpnr-himbaechel-spartan6`) when Process Properties chooses the nextpnr engine;
  auto stays on Silinx's engine there. Silinx still maps the design into sites. The notices name the new package.
