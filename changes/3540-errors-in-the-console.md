In short:

- **Errors in the console:** a drawing or a file that cannot be opened, and constraints the I/O Pin Planner cannot read,
  are ERROR lines of the console, its Errors tab in front, no longer a toast; Verify's dialogs say what is wrong with the
  depth, the time limit or the property beside the fields.

In detail:

- **Errors shown as toasts (#3540):** "Cannot open …" (web/js/drawings.js, drawings-tt.js, app.js; and the ASM chart's
  read of Convert to State Diagram) and "Cannot parse UCF" (pinplanner.js, now naming the constraints file) go through
  the new `logError` of web/js/console.js: `ERROR: cannot open <file>: <reason>`, the Errors tab in front. Verify
  Equivalence's, Verify Assertions' and Verify Property's dialogs (verify.js, verify-props.js) show their fields' errors
  on a line of the dialog (`fieldError`), no longer as toasts of the kind `'err'`, which had no style.
  test/web-toasts.test.js: every toast's kind has a style, and no toast says a file cannot be opened or parsed nor a
  field's error; test/ui/open-errors.test.js and test/ui/verify-props.test.js in both interfaces. The toasts that still
  carry a message: #3591.
