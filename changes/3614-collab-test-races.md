In detail:

- **The live sharing's tests on a loaded machine (#3614):** two tests of test/collab.test.js read a follower's events
  once it was closing, before its end's event came (on a loaded runner it had not), and the failure left the
  relay's connections open, so the file waited for them with no end and CI's part timed out after 90 minutes; they
  wait for the end's event, and the file's server drops every connection at its end.
