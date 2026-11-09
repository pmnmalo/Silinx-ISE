In short:

- **Boards:** the Digilent Basys 3 and Nexys A7 (the 7-series' Artix-7), an experimental family: their pins, their
  constraints written as an XDC; no flow implements them yet.

In detail:

- **The Basys 3 and the Nexys A7 boards, their constraints as XDC (#3142):** the Digilent Basys 3 (xc7a35tcpg236-1) and
  Nexys A7 (xc7a100tcsg324-1) in the board choice of New Project and Design Properties, marked "(experimental)", as is
  their family, Artix-7: their clock, LEDs, switches, buttons, seven-segment display, VGA, USB-UART, PS/2 and Pmods,
  from Digilent's master XDCs (every pin checked against them). A project of the family has its constraints in
  `constraints/top.xdc`: Update Constraints, New Source and an example made for the board write the board's pins as
  Vivado reads them (each pin's `PACKAGE_PIN` and `IOSTANDARD`, the clock's `create_clock`, the board's `CFGBVS` and
  `CONFIG_VOLTAGE`), and Check Constraints reads it. No flow runs the family yet (Vivado #1649, the Silinx toolchain
  #3146): its process tree has the constraints and the checks only, the synthesis tool is locked, Implement and
  Program are not offered, and the console says so when the board is chosen. The XC7A35T joins the device database;
  Artix-7's constraints were UCFs for ISE before. The MCP server's `list_devices` marks the family and its boards
  experimental, `set_design_properties`, `new_project`, `new_source` write XDC and `run_process` refuses with the
  interface's message. `new_source` now writes an iCE40's constraints with the PCF template (it wrote the UCF's).
