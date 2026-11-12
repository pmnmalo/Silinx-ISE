// Every example on the Nexys3's XC6SLX16 with nextpnr's Map (#3138), against Silinx's Map (#3139): examples-nextpnr-s6-pack-lib.mjs
// (the Atlys's: examples-nextpnr-s6-pack-atlys.test.js).
import { S6_TARGETS } from './examples-lib.mjs';
import { packTests } from './examples-nextpnr-s6-pack-lib.mjs';

packTests(S6_TARGETS.find(t => t.board === 'nexys3'));
