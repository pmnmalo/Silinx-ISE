In short:

- **Grading:** a synthesis test's slice limit works in an installation from the release zip, such as the students'
  GitHub Action: nextpnr's chip database is downloaded first. Offline, the report says the slices were not checked.

In detail:

- **Slice limits without the chip databases installed (Fixes #3215, part of #3191):** server/grade-synth.js
  slicesChipdb, called by server/grade.js synthesisStatus when a test limits the slices.
  - The grader gets nextpnr's chip database of the device before the submission's process runs (Place & Route's own
    download, checked and kept), and the process may read that one folder. Before, the process could neither
    download nor keep it, and the test's verdict was a wrong Not Synthesizable.
  - When it cannot be had, the slices are not checked: the other limits give the verdict, and the test's messages say
    why.
  - Tests: grade (the verdicts and messages), grade-server (an installation with its database, offline, a test with no
    slices asks for none).
