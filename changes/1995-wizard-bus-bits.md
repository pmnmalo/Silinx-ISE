In short:

- The New Source wizard shows a bus port's bits as (7:0), as the symbols do (it showed VHDL's 7 downto 0).

In detail:

- **A bus's bits in the wizard (#1995):** a port of width N shows (N-1:0) next to its width, the neutral form of the
  symbols, in place of VHDL's (N-1 downto 0), which had no Portuguese.
