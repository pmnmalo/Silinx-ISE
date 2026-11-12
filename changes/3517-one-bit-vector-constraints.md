In detail:

- **A one-bit vector's pin in an XDC, PCF, LPF or CST (#3517):** Implement's check of the constraints said that `sw[0]` of a
  `std_logic_vector(0 downto 0)` (the vga example's `sw`) was no port of the top; found running vga on the Basys 3 in the
  browser edition (#3143). The checks' move to core/constraints-check.js (#2296) takes such a port as a bus; a regression
  test keeps it so. Tests: constraints-format (XDC, PCF, LPF, CST: the one-bit vector's bit, a bit it has not, a scalar's).
