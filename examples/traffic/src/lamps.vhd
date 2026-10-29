-- lamps: combinational module generated from the Boolean algebra lamps.bool.json (Silinx Boolean Algebra / Karnaugh Map).
-- Edit the table, not this file: the file is generated from it. Inputs: phase2, phase1, phase0, blink (phase2 is the
-- most significant bit of a row).
--
-- car_r = Σm(4, 5, 6, 7, 8, 9, 10, 11) + d(14, 15)
-- car_r = phase2'·phase1 + phase2·phase1'   (minimal SOP, 4 literal(s), 5 gate(s), delay 3)
-- don't care: car_r = d(14, 15)
-- car_y = Σm(2, 3, 13) + d(14, 15)
-- car_y = phase2'·phase1'·phase0 + phase2·phase1·blink   (minimal SOP, 6 literal(s), 5 gate(s), delay 3)
-- don't care: car_y = d(14, 15)
-- car_g = Σm(0, 1) + d(14, 15)
-- car_g = phase2'·phase1'·phase0'   (minimal SOP, 3 literal(s), 4 gate(s), delay 2)
-- don't care: car_g = d(14, 15)
-- walk_r = Σm(0, 1, 2, 3, 4, 5, 10, 11) + d(14, 15)
-- walk_r = phase2'·phase0' + phase1'·phase0   (minimal SOP, 4 literal(s), 6 gate(s), delay 3)
-- don't care: walk_r = d(14, 15)
-- walk_g = Σm(6, 7, 9) + d(14, 15)
-- walk_g = phase1·phase0 + phase2·phase1'·phase0'·blink   (minimal SOP, 6 literal(s), 5 gate(s), delay 3)
-- don't care: walk_g = d(14, 15)

library ieee;
use ieee.std_logic_1164.all;

entity lamps is
    port (
        phase2, phase1, phase0, blink : in  std_logic;
        car_r, car_y, car_g, walk_r, walk_g : out std_logic
    );
end lamps;

architecture truth_table of lamps is
begin
    car_r <= (not phase2 and phase1) or (phase2 and not phase1);
    car_y <= (not phase2 and not phase1 and phase0) or (phase2 and phase1 and blink);
    car_g <= not phase2 and not phase1 and not phase0;
    walk_r <= (not phase2 and not phase0) or (not phase1 and phase0);
    walk_g <= (phase1 and phase0) or (phase2 and not phase1 and not phase0 and blink);
end truth_table;
