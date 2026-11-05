In detail:

- **A link's Try it found the drawing whatever its name's case (#2876):** Copy Link… and `view=try` refused a module
  drawn as a schematic whose name differed in case from the module's (the HDL's VHDL names are in lower case, a
  drawing's as it was typed): "is not a schematic, a state diagram or a Petri net". A module and its drawing now match
  whatever their case, or through the drawing's generated HDL file; a link's `top=` is checked so too.
