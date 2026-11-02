In detail:

- **Spartan-6 LUT combining never takes a slice more (#2279):** the Silinx packer's LUT combining (`combine: 'area'`)
  moves the LUTs of a slice into other positions' O5 only when all of them fit, so that the slice is saved; one by
  one, from slices it did not empty, it had taken the O5s the flip-flops need and could pack a design (the first
  version of the isqrt example) in one slice more than without it. Test: test/s6-pack.test.js.
