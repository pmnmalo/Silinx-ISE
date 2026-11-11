In detail:

- **Long chains in the synthesis input (#3374):** a chain of more than `CHAIN_SPLIT` (32) branches (an if … else if /
  elsif chain, a case of ranges) is written as an if of its halves (src/synth-stmts.js `splitChain`), each half the
  same way: nested as deep as the log of its length. Yosys's front end overflowed its stack on an else if chain of 250
  branches, its muxcover on the multiplexers of 1000. Shorter chains are written as before.
