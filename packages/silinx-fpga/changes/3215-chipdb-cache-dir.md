In detail:

- **chipdbCacheDir in the Node API (#3215):** `src/node.js` exports it, the folder where nextpnr's downloaded chip
  databases of a package's version are kept, so that a caller can let a sandboxed process read that folder only.
