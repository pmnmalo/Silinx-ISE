In detail:

- **The Nightly's design corpus on nextpnr: the time it takes, and a timeout told by its stage (#2909).** The corpus's
  largest flows take one to two hours each on nextpnr on a hosted runner, and the job stopped at its 3 h: its budget is
  now 340 min and a design's 180 min. A design out of time was reported as a front end timeout, whatever stage was
  running (secworks-sha256's front end passes in under a second): the worker now tells each stage as it starts, and the
  timeout is that stage's, the stages it finished kept (`timedOutResult`, test/designs-corpus/lib.mjs).
  - **Tests:** test/designs-corpus.test.js.
