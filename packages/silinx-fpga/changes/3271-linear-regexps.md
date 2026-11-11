In detail:

- **Regular expressions in linear time (#3271, #3171, #3278):** `synBlocks` finds an assignment's escaped target up to
  the space that ends it, as Verilog's, and `cmpStep` finds each `synth_xilinx … -run <from>:<to>` command by command,
  both in linear time on any input (they were quadratic, CodeQL js/polynomial-redos), with the same results on the
  synthesis' own text; `cellSources` escapes the top's name in full in its synthesis file's pattern.
