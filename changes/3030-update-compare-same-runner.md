In detail:

- **The nextpnr update comparison's run times measured on one runner (#3030):** `nextpnr-update.yml` measured the base
  and the pull request in separate jobs, on different runners, whose speed alone moved the run times by 20-39 % and
  marked whole boards worse or better. Both sides of a board now run in one job (a job per board and per half of its
  examples), the base's packages installed into a copy of the checkout, alternated (base, head, head, base, base, head);
  each run time is the median of its side's runs, marked only past 10 % and past the spread of either side's runs, every
  run of one side slower than every run of the other. A board whose nextpnr package does not change is not measured
  (the comment says so). The Yosys update's comparison keeps a side per job: its size and critical path are the same on
  any runner.
