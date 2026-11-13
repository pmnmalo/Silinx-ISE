In detail:

- **The Nightly's corpus jobs run again (#3734, #3735, #3736).** #3543 had stopped exporting `fetchYosysTests` and
  `YOSYS_TEST_DIRS` from `scripts/fetch-yosys-tests.mjs`, which `test/corpus/run-corpus.mjs` imports dynamically by
  the pieces of its path ("fetchYosysTests is not a function"): both exported again. `test/unused-exports.test.js`
  sees a module named by a bare file name (a piece of a `path.join`) as used, and a new check fails on a name taken
  from a dynamic import (`const { a } = await import(…)`) that its module does not export; `web/js/wizards.js`'s
  three exceptions leave its list, now seen used.
