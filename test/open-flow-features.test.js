// The Spartan-3E's block RAMs, multipliers and shift registers through the whole open flow (test/fixtures/open-flow), each to
// a complete bitstream with no warning; split from test/open-flow.test.js, run beside it (#3124). The fixtures and their
// settings: FEATURES in test/open-flow-lib.mjs.
import { testFeatures } from './open-flow-lib.mjs';

testFeatures(['RAMB16', 'MULT18X18SIO', 'SLICEM', 'BSCAN']);
