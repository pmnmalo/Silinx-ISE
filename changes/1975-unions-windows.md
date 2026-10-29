In detail:

- **The unions' test on Windows (#1975):** a bit-field's layout is the implementation's; the C simulation lays them
  out as GCC and clang on Linux and macOS (the System V ABI), and MinGW lays the test's 30-bit field out otherwise, even
  with `-mno-ms-bitfields` (which #1972's change tried and is taken back): that one program is not compared with the
  compiler on Windows.
