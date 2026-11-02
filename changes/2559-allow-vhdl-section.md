In detail:

- **The private-data check allows the VHDL standard's section 9.3.3.3 (#2559):** the section cited by #2548's fix
  in core/elab-expr.js, core/elaborate.js and test/vhdl-unconstrained-const.test.js was read as an IP address, and
  test/private-data.test.js failed on main. Test: test/private-data.test.js.
