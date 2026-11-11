// The top module's name in a Yosys script (#3416): the synthesis writes it into its commands (`-top <name>`, the
// files `<name>.json` …), which Yosys reads by words, a `;` ending a command. A Verilog escaped identifier holds no
// space (it ends at one), but a name given as it is (a VHDL extended identifier, \a; b\) may: its words would be read
// as more arguments or commands. Such a name is refused before any script is written.

/** Why the top module's name cannot be written into a Yosys script (a space or a control character), or null. */
export function scriptTopError(top) {
  // eslint-disable-next-line no-control-regex
  if (typeof top !== 'string' || !top || /[\s\0-\x1f\x7f]/.test(top)) {
    // eslint-disable-next-line no-control-regex
    return `the top module's name '${String(top).replace(/[\0-\x1f\x7f]/g, '?')}' holds a space or a control character, which Yosys's script cannot name: rename the module`;
  }
  return null;
}
