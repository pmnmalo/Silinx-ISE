In detail:

- **A schematic whose module symbol's ports or HDL block's inputs / outputs are not a list opens (#3419):** such a
  field (a string, an object, an item that is not a pin) is read as no pin, a module's then its module's ports, where
  `normalizeDoc` threw a `TypeError` and the schematic did not open.
