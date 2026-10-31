In short:

- **Export Xilinx ISE Project with a C module:** the project now builds in ISE: the C source goes out as its generated HDL.

In detail:

- **A C source in an exported ISE project (#2320):** File ▸ Export Xilinx ISE Project writes each C source's generated HDL (`src/x.c.vhd` or `.v`) into the zip and the `.xise`, in the full application and in the browser, and leaves the C out, since imported back that HDL would hide later edits of the C; such a module can be the top; a C source with errors is reported as a warning. The example isqrt, which ISE refused (`isqrt is not an entity name`), joins `test/ise/xise-interop.test.js`.
