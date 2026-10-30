In short:

- **A one-bit bus port keeps its UCF pin:** a port declared `std_logic_vector(0 downto 0)` and constrained as
  `NET "btn<0>"` (or `btn(0)`) is placed on its LOC with its I/O standard; the packer dropped the line before.

In detail:

- **The packer: a LOC written x<0> on a one-bit bus port (#2199):** such a port is `x` in the netlist, as XST names it
  `x<0>` in the UCF. `portAssignments` (src/ucf.js) took the exact name only, so the constraint was dropped silently
  and the placer chose the pad. An exact name `x<0>`, `x(0)` or `x[0]` that no port bit has now goes to the port bit
  `x`, as ngdbuild finds it and the nextpnr engine already did; a name no port has stays as written (Check Constraints
  reports it). The traffic (`btn`) and vga (`sw`) examples now get every UCF pin on the Basys2-100 / 250 and the
  Nexys2-500 / 1200. The Spartan-6 flow reads the constraints the same way (src/fpga/s6/phys.js): traffic, stopwatch
  and vga (`sw`) on the Nexys3 and the Atlys move to their UCF pins, and their routing switches in
  research/s6/measured/route-compare.json are measured again (Silinx's figures only; ISE's night-1 routing is
  unchanged). Tests: test/ucf.test.js, test/iob-pack.test.js, test/s6-route.test.js.
