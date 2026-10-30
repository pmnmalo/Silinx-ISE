In short:

- Schematic: Symbol Info of an M4_1, M8_1 or M16_1 with a pin per bit opens again, and every symbol with a pin per bit
  describes its pins with their bit.

In detail:

- **Symbol Info: pins per bit (#2141):** the datasheet of a multiplexer of 4 to 16 inputs with Pins per bit stayed
  empty (its data pins, D0_1…, had no index for their text), and the other symbols with Pins per bit described their
  pins wrongly ("Input null"; INV's inputs as outputs). Each row's pin is now described as the one-bit symbol's, with
  its bit: D2_1 "Data input selected when S1 S0 = 10 (2) (bit 1)", O1 "Output: the selected data input (bit 1)"; the
  shared selects and enable as before. Tests: test/symdocs.test.js, test/ui/sch-symdoc-bits.test.js.
