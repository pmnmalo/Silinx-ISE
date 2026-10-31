In detail:

- **The interoperability with ISE tested against ISE (#2308):** `test/ise/xise-interop.test.js` opens every example's exported project in ISE's own project flow (`xtclsh`), builds it through to the bitstream on the Basys2-250 and the Nexys3 with the warnings asserted, and imports back the folder ISE leaves; `test/xise-ise-files.test.js` reads `.xise` files written by ISE itself, with no ISE at hand. What they found: the HDL of a C function is not exported (#2320), and the examples' warnings on the Spartan-6 (#2321).
