In detail:

- **The weekly comparison with ISE keeps what it has measured and finishes over several runs (#3292):** with the three
  Optimizations and nextpnr, the comparison grew to about 40 hours, and the run of 2026-11-09 was cancelled at its
  20-hour limit with nothing published. The Area builds alone took 10.5 hours, against 3.1 for Normal on 2026-10-25,
  and making the projects took 7. Now `compare-ise.mjs --cache` keeps each build's result on the runner as soon as it
  is measured (`test/designs-corpus/quality-cache.mjs`). A Silinx build is keyed by the commit compared; an ISE build is
  keyed by the ISE image and the build scripts, so it is reused across commits. A later run takes those results instead
  of building again. `--deadline` lets no build start after a time, and the ones left are listed in the results'
  `missing`; `--build-timeout` stops a build that runs too long. A Silinx build runs in a process of its own so that it
  can be stopped, and trce times its routing as soon as it is routed. The builds run design after design, so a stopped
  run leaves whole designs. The workflow publishes a partial comparison, and *docs/QUALITY.md* marks it and lists the
  builds not measured yet. The next run resumes that commit (its projects kept too) rather than starting main's
  latest from nothing. Each run's summary says which builds it measured, took from the cache, timed out or left.
