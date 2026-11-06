In short:

- **Faster Place & Route on large designs:** the Spartan-3E's nextpnr engine no longer spends tens of minutes routing a
  congested design: vtr-diffeq1 now places and routes in about 4 minutes instead of 16.

In detail:

- **The Spartan-3E's nextpnr engine at 1.1.0: router 1's effort bounded (#2912).** nextpnr-himbaechel-spartan3e 1.1.0
  stops router 1 past 30000 wires visited per arc to route (200 million in all) and routes the design with router 2 from
  there. A congested design no longer floods the device with router 1's searches: in the design corpus's run (Silinx's
  flow, nextpnr in WebAssembly, two designs at a time) vtr-diffeq1's flow takes 253 s (946 s on 1.0.0), secworks-aes
  840 s, epfl-multiplier 1425 s, epfl-log2 375 s (1.0.0's on CI: 6252 s, about 6000 s and 4000 s). A design router 1
  routes within the budget, every example among them, routes as before; router 2's routes are a little slower
  (vtr-diffeq1's critical path 38.1 ns, 36.6 before; epfl-multiplier's 77.8 ns, 72.5). The corpus's local run times of
  the four designs recorded (test/designs-corpus/times.json).
  - **Tests:** test/nextpnr-s3e-effort.test.js (new): the vga example through Silinx's nextpnr flow, router 1 within its
    budget with no warning, and router 2 past a budget made small, its routes read back complete with no warning.
