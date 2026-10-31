In short:

- **Silinx HLS:** the HDL made from C computes only the bits it reads: XST no longer warns about signals assigned but never used (Xst:646) on C's int arithmetic.

In detail:

- **Each operation only as wide as its users read it (#2290):** an addition, subtraction, bitwise operation, negation, shift left or multiplexer whose result is truncated (C's integer promotions: `odd + 2` an `int`, kept in 6 bits) is made that wide, its operands' low bits taken; a constant read only as a shift's amount is written as a number, with no signal of its own. The results are the same (co-simulated against the C).
