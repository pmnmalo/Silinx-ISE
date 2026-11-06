In detail:

- **The designs through ISE on nextpnr's chip databases of the measured descriptions (#2502).** Research only; no
  change for the toolchain's users. `research/s3e-route/open-flow.mjs --chipdb dir` places and routes on
  `dir/chipdb-<die>.bin` instead of the package's chip database. With the measured descriptions' chip databases, built
  by the fork's generator (pmnmalo/nextpnr-spartan#14), 85 designs passed ISE: the 10 examples on the four Spartan-3E
  boards and the 45 open-flow fixtures. Every design had DRC 0 errors and 0 warnings, xdl2ncd 0 warnings, and a `.bit`
  byte-identical to ISE's bitgen, with CRC on and off (research/s3e-device/README.md, section 17).
  - **Tests:** test/open-flow.test.js.
