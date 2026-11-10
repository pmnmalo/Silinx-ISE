In detail:

- **32 placements at High for a small design (#2940):** on the Spartan-3E, `nextpnrTries('high', slices)` gives 32
  placements to a design of up to 100 slices (`NEXTPNR_TRIES.highSmall`, `smallSlices`) and eight to a larger one, as
  before; the fastest is kept. On the XC3S1200E at Optimization Speed: iwls05-sasc 4.763 → 4.563 ns, itc99-b10
  4.751 → 4.659 ns, iwls05-usb-phy 4.889 → 4.819 ns; Place & Route two to three times as long on these designs.
