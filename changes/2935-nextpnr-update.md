In detail:

- **A nextpnr update measured before it is merged (#2935):** a pull request that changes a nextpnr package
  (`@silinx/nextpnr-himbaechel-spartan3e`, `-spartan6`) runs `.github/workflows/nextpnr-update.yml`: every example
  through the application's flow on the Basys2-250, the Nexys3 and the Atlys with the new packages and with the base
  branch's, and one table of the differences (slices, LUTs, flip-flops, the minimum period, the run time; a change beyond
  the noise marked) in the job summary, an artifact and a comment, labelled "nextpnr update" and never merged on green
  alone (CLAUDE.md, scripts/nextpnr-update-report.mjs). Dependabot no longer groups the two packages with the other npm
  updates: each update is a pull request of its own.
