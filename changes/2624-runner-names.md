In detail:

- **The ISE runner's names say Silinx (#2624):** its launchd daemons and agents are `com.github.pmnmalo.silinx.*`,
  its scripts' folder `Library/Silinx-runner`; `scripts/ise-runner/install.sh` unloads and removes the old ones. The
  ISE tests' work folders on the ISE host are `silinx-examples`, `silinx-tests` and `silinx-timesim`. The old-name
  guard lists only what stays on purpose: the old command `bin/silinx-ise.js` (removed later, #3133) and the runner's
  clean-up of its old names.
