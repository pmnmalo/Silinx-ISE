In detail:

- **Router: the carry's data input on either of a LUT's first two inputs (#25):** a carry stage whose data input
  (CY0F / CY0G) is the LUT's pin 1 or 2 (the packer puts it on pin 1) may now have its net on either of them, as
  the LUT inputs are swapped (ISE's router does the same): the router takes the one its fastest or least
  congested path reaches and the setting follows (`CY0F::F2`). When the other of the two pins is held by a net
  the router does not route, it stays.
