In detail:

- **Two tests that failed on main (#3462):** the Development menu's change titles leave out an issue reference named
  with a word too, "(Fixes #N)", "(part of #N)" or "(Refs #N)", as they leave out "(#N)" (core/changelog.js
  changeTitle; three fragments kept theirs); the Spartan-6 pad measurements' scripts
  (packages/silinx-fpga/research/s6/measure-3169-s6.sh, run-3169-s6.mjs) name their ssh options ISE_SSH_ARGS, no
  longer with Silinx's old name (test/old-name.test.js). Tests: changelog (the references with a word).
