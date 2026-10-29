In short:

- A Boolean algebra source is now named <name>.bool.json (it was <name>.tt.json); the .tt.json ones of existing projects
  keep opening and working as before. The traffic example's table is lamps.bool.json.

In detail:

- **Boolean algebra sources named .bool.json (#2065):** New Source, the state diagram's Create Boolean Algebra and the
  wizards make <name>.bool.json; every place that knows the drawings (core/view-hdl.js's VIEW_RE, the Design pane,
  open, rename, find, split view, the HDL file's banner, the ISE export's Silinx-only files) knows both extensions, so a
  project's <name>.tt.json is the same kind of drawing. examples/traffic/src/lamps.tt.json is lamps.bool.json (its HDL
  and the other sources' comments say so). Tests: test/view-hdl.test.js, the UI tests that make algebra sources.
