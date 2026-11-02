----------------------------------------------------------------------------------
-- Silinx example (micro80): the memory's first contents, the program of the Intel 8080, hand-assembled.
-- Each line: its bytes, then their address and their instruction.
--   the switches: two numbers of 4 bits, SW7..SW4 and SW3..SW0; their product on the display, in decimal
--   the tick (a flag of the hardware, 8 times a second): the LEDs count them, in a variable in memory
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

package program_pkg is
    type memory_t is array (0 to 1023) of STD_LOGIC_VECTOR (7 downto 0);

    constant PROGRAM_BYTES : memory_t := (
        X"31", X"00", X"04",        -- 0000        LXI  SP,0400h   the stack: the top of the memory, going down
        X"AF",                      -- 0003        XRA  A
        X"32", X"00", X"03",        -- 0004        STA  0300h      the count of ticks: 0
                                    --             main:
        X"DB", X"00",               -- 0007        IN   0          the switches
        X"47",                      -- 0009        MOV  B,A
        X"E6", X"0F",               -- 000A        ANI  0Fh
        X"4F",                      -- 000C        MOV  C,A        C: SW3..SW0
        X"78",                      -- 000D        MOV  A,B
        X"0F", X"0F", X"0F", X"0F", -- 000E        RRC  (4 times)
        X"E6", X"0F",               -- 0012        ANI  0Fh
        X"47",                      -- 0014        MOV  B,A        B: SW7..SW4
        X"CD", X"36", X"00",        -- 0015        CALL mul        A = B * C
        X"CD", X"4C", X"00",        -- 0018        CALL bcd        D, E = A's decimal digits
        X"7A",                      -- 001B        MOV  A,D
        X"D3", X"00",               -- 001C        OUT  0          the display's left two digits
        X"7B",                      -- 001E        MOV  A,E
        X"D3", X"01",               -- 001F        OUT  1          the display's right two digits
        X"DB", X"01",               -- 0021        IN   1          the tick's flag
        X"E6", X"01",               -- 0023        ANI  01h
        X"CA", X"07", X"00",        -- 0025        JZ   main
        X"D3", X"03",               -- 0028        OUT  3          clears the flag
        X"3A", X"00", X"03",        -- 002A        LDA  0300h
        X"3C",                      -- 002D        INR  A
        X"32", X"00", X"03",        -- 002E        STA  0300h
        X"D3", X"02",               -- 0031        OUT  2          the LEDs
        X"C3", X"07", X"00",        -- 0033        JMP  main
                                    --             mul: A = B * C, shifting and adding, 4 bits
        X"1E", X"00",               -- 0036        MVI  E,0        the product so far
        X"16", X"04",               -- 0038        MVI  D,4        the bits left
        X"79",                      -- 003A loop:  MOV  A,C
        X"0F",                      -- 003B        RRC             the multiplier's next bit, into the carry
        X"4F",                      -- 003C        MOV  C,A
        X"D2", X"43", X"00",        -- 003D        JNC  skip
        X"7B",                      -- 0040        MOV  A,E
        X"80",                      -- 0041        ADD  B
        X"5F",                      -- 0042        MOV  E,A
        X"78",                      -- 0043 skip:  MOV  A,B
        X"87",                      -- 0044        ADD  A          the multiplicand times 2
        X"47",                      -- 0045        MOV  B,A
        X"15",                      -- 0046        DCR  D
        X"C2", X"3A", X"00",        -- 0047        JNZ  loop
        X"7B",                      -- 004A        MOV  A,E
        X"C9",                      -- 004B        RET
                                    --             bcd: D = F (blank), hundreds; E = tens, units
        X"16", X"F0",               -- 004C        MVI  D,0F0h
        X"FE", X"64",               -- 004E hund:  CPI  100
        X"DA", X"59", X"00",        -- 0050        JC   tens
        X"D6", X"64",               -- 0053        SUI  100
        X"14",                      -- 0055        INR  D
        X"C3", X"4E", X"00",        -- 0056        JMP  hund
        X"1E", X"00",               -- 0059 tens:  MVI  E,0
        X"FE", X"0A",               -- 005B ten:   CPI  10
        X"DA", X"6B", X"00",        -- 005D        JC   done
        X"D6", X"0A",               -- 0060        SUI  10
        X"F5",                      -- 0062        PUSH PSW        A kept on the stack while E is counted
        X"7B",                      -- 0063        MOV  A,E
        X"C6", X"10",               -- 0064        ADI  10h
        X"5F",                      -- 0066        MOV  E,A
        X"F1",                      -- 0067        POP  PSW
        X"C3", X"5B", X"00",        -- 0068        JMP  ten
        X"B3",                      -- 006B done:  ORA  E
        X"5F",                      -- 006C        MOV  E,A
        X"C9",                      -- 006D        RET
        others => X"00");
end program_pkg;
