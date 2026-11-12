In short:

- **Long generate chains:** an if … else if generate (Verilog), an if … elsif generate (VHDL) or a case generate of
  thousands of branches checks, simulates and makes its synthesis input; from about 3000 branches it overflowed the
  stack ("Maximum call stack size exceeded").

In detail:

- **Generate chains of thousands of branches (#3500):** Verilog's parser reads an if … else if generate's branches in a
  loop (it called itself per else if), VHDL's an if … elsif generate's; the elaboration takes a chain's branch in a loop,
  and a VHDL elsif or case alternative is marked as the same construct as a Verilog else if (`elseChain`), so it
  elaborates in the generate's own scope (`g.s`, as its first alternative), no longer one scope deeper per alternative
  before it (`g.g.g.s`). The passes that walk a module's items (the hierarchy's tops and roots, the VHDL pure-function
  check, a schematic's source pieces, the Design pane's instances, the editor's symbols) do it in a loop
  (`genChain`, `walkItems` in packages/silinx-hdl/src/util.js), as #2577 did for the sequential chains. A chain is not
  nesting: 20 000 branches check with no warnings, simulate, make their synthesis input and translate both ways. A
  Verilog else if chain of more than 16 branches translates to VHDL in a block of constants, `<label>_none_<k>` (no
  branch up to k), each branch's if generate on the one before and its own condition: the earlier branches' negation
  written out in each (#3501) made the text quadratic in their number (20 000 branches: too long a string). The repository's 256 HDL
  files parse, elaborate, check and make their synthesis input as before. Tests: test/generate-chains.test.js (Verilog's
  if … else if and case generates, VHDL's if … elsif and case generates of 20 000 branches: checked with no warnings,
  simulated at their first and last branches and past them, the synthesis input with no warnings, the hierarchy;
  translated both ways, checked with no warnings and simulated as the original; 16 and 17 branches to VHDL; a VHDL
  alternative's scope), test/ui/hierarchy.test.js (the Design
  pane's instances in a chain's branches, Check Syntax, the sources in the editor; both interfaces).
