In detail:

- **The Silinx toolchain's hold check of two flip-flops as trce's (#2226):** the timing report's hold check took the
  inputs' hold time for every flip-flop and was about 0.7 ns more optimistic than ISE's trce, so a hold violation trce
  finds was reported as met. It now takes trce's earliest delays and each flip-flop's own hold time: the worst hold
  path is trce's, its slack within about 0.1 ns. The minimum periods do not change.
