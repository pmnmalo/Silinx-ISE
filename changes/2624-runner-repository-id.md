In detail:

- **The ISE runner's jobs by the repository's ID, not its name (#2624, part of the rename to Silinx):** the ISE
  runner's hook (`scripts/ise-runner/job-started.sh`) and the ISE and Quality workflows' jobs check the repository's
  ID, which a rename keeps, so they still run once the repository is named Silinx; the hook's messages say "Silinx
  runner". The hook installed on the runner's machine is updated by running `scripts/ise-runner/install.sh` again.
