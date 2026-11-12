In detail:

- **A board's constraints: a port bit it has no pin for goes on a free header pin (#3709).** `boardAutoAssign` (ucf.js)
  puts the port bits that no resource matches on the free pins of the board's `Headers` group, in the order of the
  ports. These are user I/O that nothing on the board drives: the Mimas V2's P6..P9, the Elbert V2's, the Spartan-3A
  Starter Kit's. An input gets a pull-down, a serial `rx` a pull-up (it idles high). Each such bit's UCF line has the
  comment `# no pin on the board: on the header pin …`, and the result lists them in `onHeaders`. A board with no
  headers leaves the bits unmatched, as before. `generateUcf` writes an assignment's `comment` after its line.
