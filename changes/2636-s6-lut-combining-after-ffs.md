In detail:

- **Spartan-6 LUT combining never takes a slice more, by itself (#2636):** the Silinx packer's LUT combining
  (`combine: 'area'`) now runs after the flip-flops are placed, so it no longer takes the LUT outputs they need and
  never packs a design in more slices than without it; the packer no longer packs twice to keep the smaller. The
  isqrt example takes one slice less with combining. Test: test/s6-pack.test.js.
