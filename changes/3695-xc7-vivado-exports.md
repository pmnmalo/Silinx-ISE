In detail:

- **The Vivado timing script's unused exports (#3695):** `prepareDesign` and `nextpnrNumbers` of `scripts/xc7-timing-vivado.mjs` are used only in their file and no longer exported; the unused-exports test passes on `main` again.
