In short:
- **The iCE40 in New Project and Design Properties:** its 12 parts (LP, HX, UltraPlus, Ultra), built with the Silinx toolchain only, their pins in a PCF file.

In detail:
- **The iCE40's devices (#2463):** the parts nextpnr-ice40 names, with Lattice's data sheets' figures and packages (`server/devices-ice40.js`), no speed grade; the device picker (`web/js/device-picker.js`) without one and with the synthesis locked to Silinx; a family ISE does not implement always runs the Silinx toolchain, with only its back end's processes (no Map, timing, power, simulation models, pin back-annotation or FPGA view) and none of the "ISE not available" messages; its constraints PCF in New Source, Check Constraints, I/O Pin Planning and the emulator (`web/js/constraints-format.js`), a device change to another format moving the project to a new file. The boards are #2297.
