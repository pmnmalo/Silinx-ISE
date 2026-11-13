// Silinx - Board Emulator: the boards drawn as the real ones, by board id (#405, #2478: out of emulator.js); a board
// without a layout is drawn as rows of parts (emulator-board.js).
import { atlysLayout } from './emulator-atlys.js';
import { basys2Layout } from './emulator-basys2.js';
import { basys3Layout } from './emulator-basys3.js';
import { cmodS6Layout } from './emulator-cmod-s6.js';
import { icebreakerLayout } from './emulator-icebreaker.js';
import { mimasV2Layout } from './emulator-mimas-v2.js';
import { nexys2Layout } from './emulator-nexys2.js';
import { nexys3Layout } from './emulator-nexys3.js';
import { nexysA7Layout } from './emulator-nexys-a7.js';
import { s3StarterLayout } from './emulator-s3-starter.js';
import { s3aLayout } from './emulator-s3a.js';
import { s3eLayout } from './emulator-s3e.js';
import { ulx3sLayout } from './emulator-ulx3s.js';

export const BOARD_LAYOUTS = { basys2: basys2Layout, nexys2: nexys2Layout, 's3e-starter': s3eLayout, nexys3: nexys3Layout, atlys: atlysLayout, icebreaker: icebreakerLayout,
  basys3: basys3Layout, 'nexys-a7': nexysA7Layout, 's3a-starter': s3aLayout, 'mimas-v2': mimasV2Layout,
  's3-starter': s3StarterLayout, 'cmod-s6': cmodS6Layout,
  'icebreaker-vga': icebreakerLayout, ulx3s: ulx3sLayout, 'ulx3s-vga': ulx3sLayout };
