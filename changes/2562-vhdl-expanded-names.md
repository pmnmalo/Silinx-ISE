In detail:

- **VHDL: resolve selected names work.pkg.x without a use clause (#2562):** a type, constant, function or literal
  referred to by its expanded name (`work.defs.inc`, `work.defs.word_t`) resolves in the package's scope without
  requiring a use clause of the package, while keeping other package names invisible unqualified.
