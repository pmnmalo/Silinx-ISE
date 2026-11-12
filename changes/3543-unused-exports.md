In detail:

- **Exports nothing imports (#3543):** the seven exports used nowhere removed (`CAPTURE_FAMILIES`, `LAB_DIR`, `compareDocs`,
  `translationOf`, the toolchain's `longFuses` and `powerSources`, and `sharing` of the page's live sharing state), and
  165 names used only in their own module no longer exported, with no change of behaviour.
  `test/unused-exports.test.js` fails on an export nothing else uses, with its list of reviewed exceptions (the
  packages' public API is used by definition; other sessions' files at the time are listed for a follow-up).
