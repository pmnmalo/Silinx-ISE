In short:

- **Boolean algebra: the NAND and NOR forms with NAND or NOR gates only.** A complement in the NAND form is a NAND with
  its inputs tied, `/(a.a)`, in the NOR form a NOR, `/(a + a)`, the outer one too: no plain `/a` left. Their schematic
  has NAND gates only, or NOR gates only, also for an output in that form beside outputs in other forms.

In detail:

- **The NAND and NOR forms: a one-input NAND / NOR written with its inputs tied (#3785).** formatExpr writes it
  `/(a.a)` (`(a·a)'`, `/(a + a)`) as the HDL already did (`a nand a`) and as the schematic draws its inverter (a NAND2
  with its inputs tied); the forms' tooltips say so. In the schematic of a table whose outputs are in several forms, the
  complemented inputs of an output in the NAND (NOR) form are NAND (NOR) gates of its own, not the rails' INVs
  (core/logic-sch.js). Tests: every function of up to 3 inputs and random ones of 4 to 6, each notation parsed back
  with NAND (NOR) gates only and equal to the table; the schematics NAND / NOR only, their HDL compiled, elaborated and
  simulated to the table in VHDL and Verilog, the warnings asserted (test/logic-gate-forms.test.js).
