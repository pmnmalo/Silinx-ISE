In short:

- **Silinx HLS, the board's delays:** a C function is scheduled with the delays of the project's device (a Spartan-3E's
  for the Basys2 and the Nexys2), so its states fit the board's clock.

In detail:

- **Silinx HLS, a state that accesses a memory split by the clock (#2080):** its access made in the chain's last state
  (its address, enables and data computed by then, a value read before the chain held), so a memory's read, computation
  and write fit the period. The split is made inside `core/c-fsmd.js`, before the memories' ports.
- **Silinx HLS, the device family's delays in the IDE (#2080):** View HDL, the ASM chart, the co-simulation and the C
  Synthesis Report schedule with the delays of the project's family (`familyOf` in `core/c-timing.js`): the Spartan-3E's,
  else the Artix-7's.
