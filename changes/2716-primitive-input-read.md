In short:

- Check Syntax no longer says that a clock module of the Clocking Wizard has a signal "assigned but never used":
  its feedback to the DCM or the PLL is used.

In detail:

- **A signal that only feeds a primitive's input is used (#2716):** the design checks (core/lint.js) count an input of
  a primitive as read by it, also when its simulation model does not read it: the Clocking Wizard's feedback, a
  DCM_SP's CLKFB with no CLK0 output, a PLL_BASE's CLKFBIN, was said "assigned but never used" (Silinx:646), in VHDL
  and in Verilog. The warnings of the repository's 70 projects (90 views) are unchanged. Tests:
  test/lint-design.test.js, test/mcp-wizards.test.js.
