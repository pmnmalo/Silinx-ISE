In detail:

- **Spartan-6: the I/O and clocking bit database complete (#727):** a DCM's and a PLL's clock path, measured with ISE from
  other clock pads and to other BUFGs (research/s6/gen-dcm6.mjs --paths, ana-cmt6.mjs: db/xc6slx16-cmt-paths.json); a
  design's bits are the base's with its pad's and BUFG's changes, and combinations never measured are predicted bit for
  bit. With the pads and the clock path the residual of the examples ISE implemented, of a DCM design and of a PLL
  design is clean. The other CMT sites: #1951. Tests: test/s6-clock.test.js.
