In short:

- The Truth Table source is named Boolean Algebra (Álgebra Booleana): it holds expressions, written by hand too, and
  Karnaugh maps as well as a truth table. Its files are the same (.tt.json): projects open as before.

In detail:

- **Truth Table renamed Boolean Algebra (#2017):** everywhere the interface named the source: the New Source and
  New Project wizards' source type, *Tools ▸ Boolean Algebra / Karnaugh Map…*, *View/Edit Boolean Algebra*, the
  console's *Created Boolean Algebra …*, the Design pane's badge ([Algebra], it was [Table]) and its tips, the editor's *Boolean Algebra from Module…*,
  the FSM editor's *Create Boolean Algebra*, the Development menu's *Handwritten Boolean Algebra…*, the About text,
  the generated HDL's header (*generated from the Boolean algebra … (Silinx Boolean Algebra / Karnaugh Map)*, the
  traffic example's lamps.vhd with it), README and docs; Portuguese *Álgebra Booleana*. A text about the table of
  values itself still says truth table. The file format and its extension are unchanged. Tests: the UI tests of the
  wizards, menus, processes, editors and their Portuguese labels.
