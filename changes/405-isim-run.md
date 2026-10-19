In detail:

- **mountISim split, third part: the simulation control in web/js/isim-run.js (#405):** the queue of commands
  (#215), the run for a time in chunks, Run All, Break, Step and following the end of a run move from mountISim to
  mountRun(ctx), called at the same point of the mount; no change in behaviour. The Break button and closing the
  window go through it (breakCommands, destroy). Tests: `test/web-isim-run.test.js`, on the simulator itself.
