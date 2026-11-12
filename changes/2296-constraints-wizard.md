In short:

- **The constraints of the iCE40, the ECP5 and the Gowin:** New Source ▸ Implementation Constraints File ▸ Wizard > opens
  the PCF Wizard on an iCE40 (the iCEBreaker), the LPF Wizard on an ECP5 (the ULX3S) and the CST Wizard on a Gowin (the
  Tang Nano 9K): the module's bits on the board's pins, with the attributes the format writes (a PCF's pull-up; an LPF's
  and a CST's I/O standard, pull and drive; a CST's I/O standard the bank's of its pin), and the clock's frequency.
- **Check Constraints of a PCF, an LPF or a CST** says a pin that is no pin of the device's package, a pin given to two
  ports, a pin on no resource of the board, an I/O standard at another voltage than its bank's on the board (the Tang
  Nano 9K's LEDs and buttons at 1.8 V), a drive or a slew the family has not, and the ports with no pin.

In detail:

- The Constraints Wizard in the device's format (#2296): `core/constraints-wizard.js` (its title, its text from
  boardConstraintsText, its refusals, the attributes given), the interface's wizard (`web/js/ucf-wizard.js`: the
  attributes' columns of the format, `core/constraints-check.js` PIN_ATTRS) and the MCP server's `constraints_wizard`
  (a PCF, an LPF, a CST or an XDC; `attributes`), the same text and messages; the UCF Wizard as before.
- The checks of a PCF, an LPF and a CST (#2296, `core/constraints-check.js`): the package's pins (a QFN's numbered, a
  BGA's balls), a pin given twice, a pin on no resource of the board, an I/O standard at another voltage than its pin's
  bank's on the board (errors); an I/O standard Silinx does not know of the family, the ports with no pin (warnings); the
  ECP5's drives (4 to 16 mA) and slews, the Gowin's drives (4 to 24 mA). In Check Constraints, the editor's live check and
  before Implement; the check that the pins are the board's reads the file in its format (it read a PCF, an LPF or a CST
  as a UCF and found no pin).
- The MCP server's `check_constraints` (#2296, `server/mcp-constraints.js`): a project's constraints file checked as the
  interface's Check Constraints, in its device's format (a UCF's by checkUcf), its lines as ConstraintSystem's.
- I/O Pin Planning (#2296): the columns of the attributes the device's format writes (a PCF: a pull-up only; an LPF and a
  CST: the family's I/O standards and drives), the others disabled.
