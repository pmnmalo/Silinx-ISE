In detail:

- **The weekly comparison with ISE finishes in one run (#3297):** a whole comparison takes about 60 hours (the projects,
  7 h, then 402 builds), more than its job's 20, so each run measured part of it and the next had to be started by hand.
  The compare job of `quality.yml` now runs in five parts, one after another, each to its own deadline: the first picks
  the commit to compare, the next ones resume its builds and projects from the runner's cache, and once the comparison is
  whole the parts left skip in a minute; the last part that compared hands its results to the publish job. A run keeps
  the runner for about two and a half days.
