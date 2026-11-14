In short:

- **ISE projects keep arrayed instances and edited symbols.** Exported to Xilinx ISE and imported back, a schematic's
  arrayed instance (`reg(3:0)`) stays one, and a module drawn with a symbol of its own (pins on the top or the bottom,
  in another order) comes back drawn with it, its `.sym.json` made from ISE's `.sym`.

In detail:

- **The import of an ISE schematic (#3828, core/isesch-nets.js):** a module's block named with a range, `reg(3:0)`, is
  an arrayed instance again (it became `reg_3_0`, one instance with width mismatches); its copies' names are claimed
  (its base may be a keyword, as `reg` in Verilog). A module's instance is drawn with its ISE symbol's pins on their
  sides, in their order, at their spacing (core/isesch-symbol.js `iseSymbolLayout`).
- **The import of an ISE project (#3828, core/xise.js `iseModuleSymbols`):** a module's `.sym` drawn otherwise than
  Silinx's default symbol becomes its `<module>.sym.json` beside its source, so that its instances are not out of
  date; a file the import carries is kept (the server's and the browser edition's import).
- **The export to ISE (#3828, core/isesch-export.js):** the names of a symbol's pins on the top and the bottom drawn
  inside its body (they were written beside the pin, outside it); a module's instances drawn with two symbols said (ISE
  draws them all with the first one's: Update Symbol first). The project's zip has no `.sym.json` (a Silinx-only file).
