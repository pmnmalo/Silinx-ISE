In detail:

- **The development build's notes fit GitHub's limit (#2411):** a release's body holds at most 125,000
  characters, and the changes since v15.20.0 had grown past it, so the "Development build" workflow failed at
  Publish (`gh release edit dev`, HTTP 422). scripts/dev-notes.mjs keeps the notes under 120,000: past it, the
  "In short" items stay in full and the "In detail" list keeps its newest entries, with a line saying how many
  were left out and linking to changes/ on main; under it, the notes are unchanged. Tests: test/dev-notes.test.js
  (a synthetic set over the limit and one under it).
