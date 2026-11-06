In detail:

- **CI: the browsers' system packages kept between runs, their install bounded (#2921, #2939):** the
  webkit-standalone and browsers jobs keep apt's downloads of the packages Playwright's browsers need
  (`--with-deps`) in GitHub's cache, by the runner's image, restored before the install and saved right after
  it; the install stops at 10 minutes and runs once more with what it downloaded, a warning naming the attempt,
  within the step's 25 minutes. A slow mirror (31 kB/s) had taken 50 minutes for 114 MB of them, and the browsers
  job's time ran out 10 s after Firefox's test 125: no test hung (#2939). The browsers job's limit, 70 minutes,
  is past its steps' own, so the step that runs out is the one named.
