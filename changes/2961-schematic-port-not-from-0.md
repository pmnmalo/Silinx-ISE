In short:

- **Convert to Schematic:** a module whose port does not start at 0, `a : in std_logic_vector(4 downto 1)` or
  `input [4:1] a`, read by a bit or a slice, is converted: its bus taps take the port's own bits, and the port is
  declared as before (it was refused, "bus tap … outside its bus").

In detail:

- **A schematic's I/O marker not from 0 (#2961):** its net's bits are those of its type, `std_logic_vector(4 downto 1)` /
  `(1 to 4)` / `[4:1]`, constant bounds only (`portRange`, `core/schdoc.js`), as a bus named with its indices is (#1689,
  #2903); a marker of no type, or of a range of generics, is counted from 0 as before. So Convert to Schematic draws a
  port's bits and slices, an ascending port's slices kept as HDL; the converter's test designs in VHDL and Verilog, the
  MCP's `convert_module` and the interface's tests.
