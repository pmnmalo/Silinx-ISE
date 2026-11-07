In short:

- **Silinx HLS's RTL blackbox edited while the project is open:** its hand-written module or its C model, saved in
  its editor, is seen at once: the C function's HDL is made again with it, and C Simulation runs the new model.

In detail:

- **An RTL blackbox's files saved while the project is open (#2342):** the descriptions were read when the project
  was (re)loaded, which a description, a header, a file added, removed or renamed, or a change from outside did; a
  save of the RTL module (an HDL source) or of the C model (a C file) in its editor was not seen. Now such a save
  reads the descriptions again (`refreshBlackboxes`, web/js/project.js) before the C sources' HDL is made. The MCP's
  tools read them at each call. Tests: the UI test in both interfaces (the module's port renamed, the C's module
  gone; the description corrected, back; the C model changed, C Simulation's result with it), the MCP's after
  `write_file`.
