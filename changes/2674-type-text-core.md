In detail:

- **A type's text and a test bench's unit under test in core/ (#2674):** `typeText` (with its range and short
  expression helpers) moves, as it was, from web/js/editor.js into `core/type-text.js`, and the New Source
  wizard's `uutInfo` from web/js/new-source.js into `core/uut-info.js`, so that the server makes a test bench as
  the wizard does (the MCP's New Source, next); editor.js still exports `typeText`. No change of behaviour. Test:
  test/type-text.test.js.
