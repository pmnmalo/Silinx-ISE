In detail:

- **A top module's name that Yosys's script would read as more words, refused (#3416):** `synthesizeVerilog` and a
  script's synthesis (`scriptSynthesis`) refuse a top whose name holds a space or a control character (a VHDL extended
  identifier, `\a; b\`) before any script is written, with its message (`scriptTopError`, `src/top-name.js`, exported):
  its words after a `;` were read as Yosys commands.
