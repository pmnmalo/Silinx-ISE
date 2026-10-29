In detail:

- **The tests' timings and the bit-fields on Windows (#1972, #1975):** test/timings.json measured again from the full
  CI on main (512 files, after the moves of #1677); on Windows the C reference programs are compiled with
  `-mno-ms-bitfields`, their bit-fields laid out as GCC lays them out elsewhere (MinGW's default is Microsoft's), as the
  C simulation does.
