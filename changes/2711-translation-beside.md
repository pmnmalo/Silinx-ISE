In short:

- **An HDL source's translation beside it:** the tab menu of a Verilog source in a VHDL project has Show Generated VHDL
  Beside (of a VHDL source in a Verilog project, Show Generated Verilog Beside): its read-only translation on the other
  side of the split editor, the source kept in front.

In detail:

- **Show Generated VHDL / Verilog Beside (#2711):** an HDL source in the other language than the Preferred Language
  has the item in its tab's menu, and View ▸ Show Generated HDL Beside opens its translation too (web/js/split-view.js
  generatedOpener). The translation already open is made again where it is, with the source's unsaved edits
  (web/js/translation.js), rather than closed and opened again.
