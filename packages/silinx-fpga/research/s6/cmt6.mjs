// Stage S6-E (#727): a DCM's or PLL's clock path and settings, shared by ana-cmt6.mjs (which measures them) and
// residual6.mjs (which predicts them); in the Silinx toolchain since #732 (packages/silinx-fpga/src/fpga/s6/bitgen-cmt.js).
export { cmtPath, cmtCfg, predictCmt, CMT_FRAME, cmtKind, predictCmtSettings, CMT_REGC, cmtRegcBits, cmtUses, cmtInputBits } from '../../src/fpga/s6/bitgen-cmt.js';
