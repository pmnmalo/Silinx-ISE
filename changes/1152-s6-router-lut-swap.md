In short:

- The Nexys3's and Atlys's router (the Silinx toolchain) swaps a LUT's inputs, as ISE does: about an eighth fewer
  routing switches, as many per connection as ISE's within 8 %.

In detail:

- **Spartan-6 router: a LUT's inputs swapped to the pins its routes reach best (#1152):** a net may end on any free
  input of its LUT, the LUT's equation rewritten for the pins taken; the examples take 10 to 14 % fewer routing
  switches (1.00 to 1.08 times ISE's per connection, 1.10 to 1.22 before), in fewer passes. Test:
  test/s6-route.test.js.
