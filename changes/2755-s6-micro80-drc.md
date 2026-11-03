In detail:

- **micro80 on the Spartan-6, checked against ISE (#2755):** its register bank's distributed RAM gets its unused data
  inputs tied low, as ISE's map does, so ISE's DRC passes on the open flow's micro80 for the Nexys3 and the Atlys and
  test/ise/examples.test.js's check of it is no longer marked as known to fail.
