In detail:

- **The device families' profiles (#2310):** what each family offers the interface is data, in core/family-profile.js:
  its clock manager (the Spartan-3E's DCM_SP, the Spartan-6's PLL_BASE, and the resource that counts them), its block
  RAMs (RAMB16s, or halves of 9 Kbit), its multiplier (MULT18X18SIO, DSP48A1) and its open flow (the parts the Silinx
  toolchain takes, the bit database's folder, nextpnr as the other engine, the iCE40's own tools and steps). The
  Clocking Wizard, the Block Memory wizard, Silinx HLS's multiplier count and the browser edition's flow
  (web/js/open-flow-browser.js, its worker) ask the profile instead of testing a family's name; they offer the
  Spartan-3E, the Spartan-6 and the iCE40 exactly what they offered before. A new family is an entry of the profile.
  Tests: test/family-profile.test.js (each entry against core/clocking.js, core/blockram.js and the resources model's
  counts, the browser's flow per family as before), test/family-conditions.test.js (web/js has no condition on a
  family's name; its list of those left is empty and only shrinks).
