In short:

- **Boolean algebra: the schematic with inverted-input gates.** A complemented input of an AND or an OR is one of the
  gate's inverted inputs: `/a./c./d` is one AND3B3, not an AND3 fed by three inverters; an output that is a lone
  complement is one INV.

In detail:

- **The schematic of a table: complemented inputs as the gates' inverted inputs (#3786).** In every form but the NAND
  and NOR ones (which stay NAND or NOR only), a complemented input of an AND, OR, NAND or NOR gate is one of its
  inverted inputs, the library's ANDnBk, ORnBk, NANDnBk and NORnBk as in ISE's (core/logic-sch.js); INVs are left for
  the inputs of an XOR / XNOR (the XORnBk symbols have no ISE counterpart) and for an output that is a lone complement
  (one INV, no longer an INV and a BUF). Tests: every form of many functions, one inverted input per complement under
  an AND / OR, the INVs only where no gate fits, the HDL compiled, elaborated and simulated to the table in VHDL and
  Verilog with the warnings asserted, the ISE export with library symbols only (test/logic-sch-bubbles.test.js).
