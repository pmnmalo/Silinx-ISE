In short:

- **Silinx HLS:** a loop that fills an array from constants and its own index runs at compile time, as Vitis HLS's: the
  array a ROM, the loop not made.

In detail:

- **A table filled by a loop in the function's own body, computed at synthesis (#2151):** the C simulation runs a loop
  whose writes to arrays depend only on constants and its index (math.h's too), its results their initial values; its
  loop-only variables and its warning of an unknown count go with it. A loop reading an input, an array also written
  elsewhere or read before it, and the like stay hardware.
- **A table of ap_fixed computed at synthesis (#2151):** its values were taken as integers; now as the C simulation's, by a
  function (#1779) or a loop; one wider than a double's 53 bits stays hardware.
