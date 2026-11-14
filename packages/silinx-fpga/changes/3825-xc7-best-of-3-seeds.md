In detail:

- **The 7-series' best of 3 seeds (#3825):** `spec.xc7Seeds: 3` (`xc7SeedsOf(impl)`, open-steps.js) has the 7-series' back
  end (open-flow-xc7.js) place and route with seeds `spec.seed`, +1 and +2, the best Fmax kept (`xc7BestRun`: a tie to the
  lowest seed, a failed run left out, null when all failed), the seeds in `report.par.seeds` and `par.seed`, in
  nextpnr-report.json and in the timing report (`xc7SeedsLine`); only the kept run's `Warning:` lines are logged. The
  runs go at once through `io.nextpnr.xc7.runApart` when its `parallel` allows three (nextpnr-xc7-node.js: each in a
  worker thread of its own, nextpnr-xc7-node-worker.js; three on a computer of 8 GB and 4 cores, `xc7Parallel`), else one
  after another through `run`. nextpnr's `--seed` is now the last of its arguments.
