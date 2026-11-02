In detail:

- **The Spartan-6 packer's LUT combining after the storage elements (#2636):** `packS6(nl, { combine: 'area' })`
  combined the LUTs before the storage elements that go with others of their control set were placed: it took the
  O5s their 5FFs' route-throughs needed and emptied slices whose FFs they then filled again, one slice more than
  without combining (#2279's isqrt top, on today's synthesis even with #2279's all-or-none move; no later pack change
  brought it back). It now combines once every storage element is placed, where moving a slice's LUTs can only save
  that slice, and packs once: #2635's second packing without combining is gone. The isqrt example packs in 28 slices
  with combining (29 before). Test: test/s6-pack.test.js.
