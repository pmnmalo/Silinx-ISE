// Silinx - Board Emulator: the boards drawn as the real ones, by board id (#405, #2478: out of emulator.js); a board
// without a layout is drawn as rows of parts (emulator-board.js).
import { atlysLayout } from './emulator-atlys.js';
import { basys2Layout } from './emulator-basys2.js';
import { icebreakerLayout } from './emulator-icebreaker.js';
import { nexys2Layout } from './emulator-nexys2.js';
import { nexys3Layout } from './emulator-nexys3.js';
import { s3eLayout } from './emulator-s3e.js';

export const BOARD_LAYOUTS = { basys2: basys2Layout, nexys2: nexys2Layout, 's3e-starter': s3eLayout, nexys3: nexys3Layout, atlys: atlysLayout, icebreaker: icebreakerLayout };
