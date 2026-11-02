In detail:

- **The Spartan-6 packer's LUT combining: all of a slice's LUTs or none (#2279):** `packS6(nl, { combine: 'area' })`
  moves a SLICEX's LUTs into other SLICEX positions' O5 only when every one of them finds a place, emptying the
  slice; moved one by one from slices they did not empty, they saved no slice and took the O5s the 5FFs' route-throughs
  need, and the first version of the isqrt example packed in 29 slices with combining against 28 without. When the
  storage elements placed after the combining still need the O5s it took (they then fill the slice it emptied), the
  packing without combining is returned: `'area'` never takes more slices than `'off'`. Test:
  test/s6-pack.test.js.
