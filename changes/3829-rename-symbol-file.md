In short:

- **Renaming a module renames its symbol.** Rename… of a module with a symbol of its own (the Symbol Editor's
  `<module>.sym.json`) renames that file with it, and its instances in the schematics keep their pin layout.

In detail:

- **Rename of a module and its symbol file (#3829, core/symbol-layout.js `renameSymbolFile`):** the interface's Rename…
  (web/js/rename.js) and the MCP server's `rename_module` (server/rename-module.js) write the module's new name in its
  symbol file and move a file named after the module with it, beside its source. It was left as it was: the module had
  no symbol any more (its instances marked out of date) and the old file was the symbol of no module.
