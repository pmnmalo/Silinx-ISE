In detail:

- **A schematic whose symbol's parameters are not what they should be opens (#3532):** a module symbol's module that is
  not text (a number, a list, an object) is read as its text or as no module, where `normalizeDoc` threw a
  `TypeError`; so are the other parameters read as text, a module's generics (a value that is not text dropped), the
  parameters of a symbol that are not an object, a wire's points that are not points and the HDL kept from a module's
  source (its language, texts and generics). A module named as a name of `Object.prototype` (`toString`,
  `constructor`) is no longer found where the project has none.
