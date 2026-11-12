In detail:

- Exports nothing imports (#3543): `powerSources` (the Spartan-6 router's, with its tile grid) and the Gowin chip database's
  `longFuses` removed, used nowhere; the names used only in their own module no longer exported. The package's API
  (`src/index.js`, `parts.js`, `node.js`) is unchanged.
