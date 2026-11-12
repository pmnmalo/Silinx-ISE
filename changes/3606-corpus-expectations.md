In detail:

- **The design corpus's expectations recorded again (#3606).** The Nightly's designs job failed on 13 designs whose
  results had changed with main: the synthesis input's line numbers in Yosys's "Replacing memory" warnings (neorv32,
  verilog-axis-fifo, secworks-aes, itc99-b15, itc99-b17), and the sizes and periods that sliceEstimate's change (#3389)
  moved: itc99-b11 81 slices from 89 but 36 flip-flops from 31, itc99-b15 1336 slices from 1233 with its 20 ns now
  met (#3697), epfl-bar, epfl-router, itc99-b07, b08, iwls05-sasc and usb-phy smaller. Recorded with run.mjs --update
  on those designs (the 'local' times left as they were), the README's table from them.
