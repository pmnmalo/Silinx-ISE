In detail:

- **Tests: the Board Emulator's DCM and block RAM design addresses its RAMB16 through a signal (#2602):** a
  concatenation as a port's actual is an error since #2565, as in XST; the UI test's design kept one and its
  emulator no longer started.
