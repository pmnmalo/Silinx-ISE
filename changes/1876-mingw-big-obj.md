In detail:

- **The ap_fixed reference compiled on Windows (#1876):** MinGW's assembler failed on the ap_fixed test's reference
  program ("too many sections", "file too big"): test/ap-int-ref.js passes `-Wa,-mbig-obj` on Windows.
