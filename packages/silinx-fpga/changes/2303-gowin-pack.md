In short:
- The Gowin's bitstream: gowin_pack ported to JavaScript, its .fs byte for byte Apicula's.

In detail:
- `src/fpga/gowin/` (#2303): `gowinPack(netlist, db)` (Apicula 0.32's gowin_pack for the GW1N), `loadGowinChipdb` (its chip database's .msgpack.xz: `xz.js`, `msgpack.js`), `gowin-files.js` (the database read from YoWASP's package's resources: its tar parts, Apicula's wheel); `io.nextpnr.gowin` gains `pack(routedJson, family)`, `gowinIo(load, readFile)`; the Gowin's back end its bitgen step (`<top>.fs`, `GOWIN_NO_BITSTREAM` gone). Apicula's licence in the notices; its databases not shipped.
