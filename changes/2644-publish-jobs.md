In detail:

- **The workflows that publish hold their writing token in a job of their own (#2644):** the development build, the
  release and silinx-fpga's npm release build in a job that only reads, and a job that runs no code of the repository
  or of its dependencies publishes the artifact (the tag `dev` moved by the API, the attestation, the release, `npm
  publish` of the packed tarball); the Yosys update's report job runs the base's scripts only, and checks the pull
  request out no more. A test checks that no job whose token writes installs a dependency.
- **The Vitis HLS image's base pinned by its digest (#2645),** as the ISE image's, and updated by Dependabot.
