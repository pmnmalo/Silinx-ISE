In short:

- Rename Symbol (F2) on a type, constant or function of a package also renames it in the files that use the package.

In detail:

- **Rename Symbol follows a package's declarations into the files that use it (#2558):** renaming a type, constant,
  function… declared in a package renamed it in the package's file only, and the files that use the package
  (`use work.pkg.all`) kept the old name and no longer compiled. As for a port of a module, the dialog now lists the
  files that see the package — VHDL's `use work.pkg.all` / `use work.pkg.x` and selected names `work.pkg.x`,
  Verilog's `import pkg::*` and `pkg::x` — and renames the name there too: an open file in its editor (its own Undo),
  the others written. A file with a declaration of its own of that name keeps it, comments and strings are not
  changed, and a new name that would mean another object in one of those files is refused, naming the file. The
  scopes of a source (core/scopes.js) now resolve `work.pkg.x` in VHDL and `pkg::x` in Verilog to the package's
  declaration (in its own file too). core/rename.js: `packageOf`, `packageDecl`, `renamePackageItemInSource`.
  Tests: test/rename.test.js (a package's type, constant and function in two files through `use … .all`, one
  through its names, a local declaration kept, the body in another file, Verilog; each renamed project compiles and
  elaborates with no messages; the examples' renames also follow into the files that use a package),
  test/ui/refactor.test.js (both interfaces, in Portuguese).
