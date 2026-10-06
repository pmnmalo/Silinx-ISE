# ISE schematic fixtures

Real Xilinx ISE schematics used by `test/isesch.test.js`, copied unmodified from public
repositories with permissive licenses.

| File | Format | Source | License |
|---|---|---|---|
| `MyAND2b4.sch` | ISE 14 XML (`<drawing version="7">`) | https://github.com/Asudy/LCDF_Expr/blob/master/Expr12/MyALUTrans/MyAND2b4.sch | MIT, Copyright (c) 2020 Asudy Wang |
| `Mux4to1b4.sch` | ISE 14 XML (`<drawing version="7">`) | https://github.com/Asudy/LCDF_Expr/blob/master/Expr12/MyALUTrans/Mux4to1b4.sch | MIT, Copyright (c) 2020 Asudy Wang |
| `list1.sch` | ISE text format (`VERSION 6`) | https://github.com/Dynchikkk/InstituteRep/blob/main/semester_5/PLIS/lab1/Lab1.2/Lab1/list1.sch | Apache-2.0 (Dynchikkk/InstituteRep) |
| `Counter_2b.sch` | ISE text format (`VERSION 6`) | https://github.com/USC-HW-Engineers/EE533-DPU/blob/main/Labs/Lab%206%20Quad%20HW-Threaded%20ARM%20ISA%20Compatible%20Processor%20Core%20in%20NetFPGA/Emiliano/ARM_Processor_4T/Counter_2b.sch | MIT, Copyright (c) 2026 USC-HW-Engineers |

What they exercise:

- `MyAND2b4.sch`: 4-bit buses split with bus taps (`A(3:0)` -> `A(0)`..`A(3)`) and a bus assembled
  from separately driven bits (`C(3:0)`), `and2`.
- `Mux4to1b4.sch`: 4-bit 4:1 multiplexer: `inv`, 20 `and2`, `or4`, many bus taps.
- `list1.sch`: `fd` registers and inverted-input gates (`and2b2`, `and3b1`, `and3b2`) feeding an `or3`.
- `Counter_2b.sch`: 2-bit counter from `ftce` toggle flip-flops and `vcc`, output bus built from bits.
