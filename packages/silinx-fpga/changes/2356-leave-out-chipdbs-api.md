In detail:

- **`leaveOutChipdbs` in the Node API (#2356):** `silinx-fpga/node` exports it (a nextpnr package without its chip
  databases, fetched on first use), which Silinx ISE's release script imported from the module itself, across the
  package's API.
