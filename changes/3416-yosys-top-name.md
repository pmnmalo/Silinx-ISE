In detail:

- **A top module's name that Yosys's script would read as more words, refused (#3416):** the compiled simulator and
  the Silinx toolchain's synthesis refuse a top whose name holds a space or a control character (a VHDL extended
  identifier such as `\a; b\`) before Yosys runs, the message saying to rename the module, where its words after a `;`
  were read as Yosys commands (held only by the first one failing, in WebAssembly).
