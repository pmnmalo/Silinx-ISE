In detail:

- **A Spartan-6 bit database test on Windows (#2465):** test/s6-bitdb-browser.test.js makes its temporary folder in the
  system's (`os.tmpdir()`), not `/tmp`, which Windows has not.
