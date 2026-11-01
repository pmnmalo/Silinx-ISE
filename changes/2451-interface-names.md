In short:

- **The interfaces' new names:** View ▸ Interface (and the header's Settings ▸ Interface) offers **Silinx** and
  **ISE style** (in Portuguese Silinx and Estilo ISE), in place of Modern and Classic. The choice made before is kept.

In detail:

- **The interfaces' names: Silinx and ISE style (#2451):** the Interface menu's entries come from one table of names
  next to `INTERFACES` (`INTERFACE_NAMES`, web/js/modern.js), so another interface is one more entry; "ISE style" is
  "Estilo ISE" in Portuguese, Silinx a proper name, the same. The code's comments and the tests' names say "the
  Silinx interface" and "the ISE style interface". A UI test reads the names in each interface's own menu in English
  and Portuguese and chooses an interface by its name; the test of the old ids now also finds the old names (Modern,
  Classic, the modern / classic interface, Moderna, Clássica, the Xilinx ISE interface).
