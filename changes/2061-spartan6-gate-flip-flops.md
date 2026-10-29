In detail:

- **Spartan-6: a slice flip-flop set as a gate in the bitstream (#2061):** the XDL writes it `#AND2L` / `#OR2L`, and
  the slice databases named its measured variant as the primitive does (AND2L / OR2L), so bitgen took it as not
  measured. bitgen-slice.js's kindModel now finds it by either name, and the clock example on the Nexys3 reaches its
  bitstream. Tests: packages/silinx-fpga/test/s6-bitgen.test.js.
