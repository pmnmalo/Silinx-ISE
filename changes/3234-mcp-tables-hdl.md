In detail:

- **test/mcp-tables.test.js expects the HDL file a truth table written by write_file has since #3184 (#3234):** set_output_logic writes `src/cyc.vhd` again; the test failed on main since #3185.
