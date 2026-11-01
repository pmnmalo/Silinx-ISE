In detail:

- **Device measurements, the XC3S1200E's long-line splitters measured by half (#2483):** a join test out of a splitter's
  bidirectional PIP cannot be read from ISE's DRC, so `splitters.mjs` reads the direction bit ISE's bitgen sets (`oracle.sh
  -b`). 19 533 verdicts, all agreeing with the shipped graph, replace the description's deference to it at the splitters:
  the 1469 split nodes a short can come from are now 0, with no merged node. The 7 examples and the 45 open-flow designs
  routed by the open flow on it pass ISE (DRC 0 / 0, `.bit` byte-identical with CRC on and off). The shipped graph is
  unchanged.
