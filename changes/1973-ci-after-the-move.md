In detail:

- **The full CI after the toolchain's move (#1973, #1974):** the i18n test's check that every Portuguese translation is
  of a text the sources still have reads the toolchain's package too (packages/silinx-fpga/src: its resource names,
  'DCMs / PLLs', 'Multipliers / DSPs', moved there in #1677); test/silinx-fpga-package.test.js imports the modules by
  their file URLs, as Windows needs.
