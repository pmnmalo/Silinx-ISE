In detail:

- **The private-data check allows a section number of the VHDL standard (#2559):** the section on aggregates that
  #2548's fix cites in core/elab-expr.js, core/elaborate.js and test/vhdl-unconstrained-const.test.js was read as
  an IP address, and test/private-data.test.js failed on main. Test: test/private-data.test.js.
