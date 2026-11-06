In short:

- **nextpnr stopping with no error:** Place & Route says where nextpnr stopped, its last line, no longer only "it
  stopped on an error".

In detail:

- **nextpnr stopping with no ERROR line (#2818).** When nextpnr stops on an exception of its own, it prints no ERROR
  line, and in WebAssembly the exception has no message. Place & Route's error now lists nextpnr's last line
  (`nextpnr stopped with no error message, after: Info: at iteration #11, type ALL: …`): the step it stopped in.
  (The ITC'99 b14 to b22's crash in the analytical placer, a LUT taken twice by one carry chain, is
  pmnmalo/nextpnr-spartan#16.)
