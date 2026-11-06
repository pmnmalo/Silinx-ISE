In short:

- **Convert to Schematic:** a module whose internal vector does not start at 0, `signal c : std_logic_vector(3 downto 1)`
  or `wire [3:1] c`, read by a bit or a slice, is converted: its net is named with its indices, `c(3:1)`, and its bus
  taps take its own bits (it was refused, "bus tap … outside its bus").

In detail:

- **Convert to Schematic, an internal vector not from 0 (#2903):** its net is named with the vector's indices, `c(3:1)`
  / `c[3:1]` (a bus named with its indices, #1689), so its bus taps take its own bits and its HDL declares it as the
  source did; an ascending one, `d(1 to 3)` / `wire [1:3] d`, is named as written, `d(1:3)`, its bits tapped and its
  slices (`d(1 to 2)`) kept as HDL, a bus tap taking its bits MSB downto LSB; a net name with its indices in ascending
  order not from 0 is the bus of those bits (`d(1:3)`: 3 downto 1, was 2 downto 0); the converter's test designs, the
  MCP's `convert_module` and the interface's tests, in VHDL and Verilog.
