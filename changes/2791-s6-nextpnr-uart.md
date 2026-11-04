In detail:

- **The Spartan-6 with the nextpnr engine: uart builds on the Atlys (#2791).** nextpnr's Spartan-6 package is now
  built from the current bit database, which knows the switches of the Atlys's USB-UART pins (#2539). nextpnr routes
  uart on every seed, on the Nexys3 and the Atlys, with no warnings.
